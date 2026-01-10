const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const NodeID3 = require('node-id3');
const puppeteer = require('puppeteer');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler for folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC handler for reading MP3 metadata
ipcMain.handle('read-mp3-metadata', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    const mp3Files = files.filter(file => path.extname(file).toLowerCase() === '.mp3');

    const results = [];

    for (const mp3File of mp3Files) {
      const filePath = path.join(folderPath, mp3File);
      try {
        const tags = NodeID3.read(filePath);

        // Handle album artwork
        let albumArt = null;
        if (tags.image && tags.image.imageBuffer) {
          const imageBuffer = tags.image.imageBuffer;
          const mimeType = tags.image.mime || 'image/jpeg';
          albumArt = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
        }

        results.push({
          filename: mp3File,
          filePath: filePath, // Include full path for writing back
          genre: tags.genre || 'Unknown',
          title: tags.title || 'Unknown',
          artist: tags.artist || 'Unknown',
          album: tags.album || 'Unknown',
          lyrics: tags.unsynchronisedLyrics?.text || tags.lyrics || '', // Read lyrics from ID3 tags
          albumArt: albumArt
        });
      } catch (error) {
        console.error(`Error reading ${mp3File}:`, error);
        results.push({
          filename: mp3File,
          filePath: filePath,
          genre: 'Error reading file',
          title: 'Error',
          artist: 'Error',
          album: 'Error',
          lyrics: '',
          albumArt: null
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error reading folder:', error);
    throw error;
  }
});

// IPC handler for writing updated genres back to MP3 files
ipcMain.handle('update-mp3-genres', async (event, updates) => {
  try {
    const results = [];

    for (const update of updates) {
      try {
        // Read current tags
        const tags = NodeID3.read(update.filePath);

        // Update the genre
        tags.genre = update.newGenre;

        // Write back to file
        const success = NodeID3.write(tags, update.filePath);

        results.push({
          filename: update.filename,
          success: success,
          newGenre: update.newGenre
        });
      } catch (error) {
        console.error(`Error updating ${update.filename}:`, error);
        results.push({
          filename: update.filename,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error updating MP3 files:', error);
    throw error;
  }
});

// Progress tracking for naming operations
let namingState = {
  currentWindow: null,
  isRunning: false
};

function sendNamingProgress(phase, message, currentStep = 0, totalSteps = 0, details = '') {
  if (namingState.currentWindow) {
    namingState.currentWindow.webContents.send('naming-progress', {
      phase,
      message,
      currentStep,
      totalSteps,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

// Naming via Lyrics functionality
ipcMain.handle('preview-naming-changes', async (event, namingRules, filesData) => {
  try {
    // Set up progress tracking
    namingState.currentWindow = BrowserWindow.fromWebContents(event.sender);
    namingState.isRunning = true;

    sendNamingProgress('starting', 'Initializing preview analysis...', 0, namingRules.length);

    // First, collect ALL matches from ALL rules
    const allMatches = [];
    const albumGroupsMap = new Map(); // albumName -> array of entries
    const processedFiles = new Set(); // Track files already processed to prevent duplicates

    for (let ruleIndex = 0; ruleIndex < namingRules.length; ruleIndex++) {
      const rule = namingRules[ruleIndex];
      sendNamingProgress('processing', `Processing rule ${ruleIndex + 1}: ${rule.albumTemplate || 'Unnamed Rule'}`, ruleIndex + 1, namingRules.length);
      
      // Track files processed within this specific rule to prevent duplicates
      const ruleProcessedFiles = new Set();
      
      // Support both old format (lyricSearch) and new format (lyricSearches)
      let lyricSearches = rule.lyricSearches || [];
      if (rule.lyricSearch && !lyricSearches.length) {
        lyricSearches = [rule.lyricSearch]; // Backward compatibility
      }

      // Skip rule if no valid searches
      const validSearches = lyricSearches.filter(search => search && search.trim() !== '');
      if (validSearches.length === 0) continue;

      // Collect files that match this rule
      for (const file of filesData) {
        // Skip files already processed by previous rules
        if (processedFiles.has(file.filePath)) {
          continue;
        }

        // Skip files already processed within this specific rule
        if (ruleProcessedFiles.has(file.filePath)) {
          continue;
        }

        // Check if lyrics contain ANY of the search texts
        const lyrics = file.lyrics || '';
        const lyricsLower = lyrics.toLowerCase();

        let foundMatch = false;
        for (const searchText of validSearches) {
          if (lyricsLower.includes(searchText.toLowerCase())) {
            foundMatch = true;
            break;
          }
        }

        if (foundMatch) {
          // Generate variables for this file
          const variables = {
            number: 1, // placeholder - will be set later
            artist: file.artist || 'Unknown Artist',
            title: file.title || 'Unknown Title',
            album: file.album || 'Unknown Album',
            genre: file.genre || 'Unknown',
            year: file.year || new Date().getFullYear()
          };

          // Use rule id as the album group key so each rule creates its own album
          const targetAlbum = `RULE_${rule.id}`;

          const matchEntry = {
            file,
            variables,
            targetAlbum,
            rule,
            ruleId: rule.id
          };

          allMatches.push(matchEntry);

          // Mark file as processed to prevent duplicates across all rules
          processedFiles.add(file.filePath);

          // Mark file as processed within this specific rule
          ruleProcessedFiles.add(file.filePath);

          // Group by rule (album) for numbering
          if (!albumGroupsMap.has(targetAlbum)) {
            albumGroupsMap.set(targetAlbum, []);
          }
          albumGroupsMap.get(targetAlbum).push(matchEntry);
        }
      }
    }

        // Now apply numbering logic to all collected matches (same as apply handler)
        const results = {
          totalMatches: 0,
          matches: []
        };

        for (const [albumName, albumFiles] of albumGroupsMap) {
          // Split into songs with and without track numbers
          let withTrack = [];
          let withoutTrack = [];
          const trackNumberMap = new Map();
          const duplicates = [];

          albumFiles.forEach(entry => {
            const trackNum = parseInt(entry.file.trackNumber);
            if (trackNum > 0) {
              if (trackNumberMap.has(trackNum)) {
                // Duplicate track number, move to extras
                duplicates.push(entry);
              } else {
                trackNumberMap.set(trackNum, entry);
                withTrack.push(entry);
              }
            } else {
              withoutTrack.push(entry);
            }
          });

          // Add duplicates to withoutTrack for reassignment
          withoutTrack = withoutTrack.concat(duplicates);

          // Find the highest track number present
          let highestTrackNumber = 0;
          for (const n of trackNumberMap.keys()) {
            if (n > highestTrackNumber) highestTrackNumber = n;
          }

          // Assign track numbers starting from 1
          let currentTrack = 1;
          let assigned = new Set();
          while (withTrack.length + withoutTrack.length > 0) {
            if (trackNumberMap.has(currentTrack)) {
              // Song with this track number exists
              const entry = trackNumberMap.get(currentTrack);
              entry.variables.number = currentTrack;
              // Update all properties using rules
              const newArtist = processTemplate(entry.rule.artistTemplate, entry.variables);
              const newTitle = processTemplate(entry.rule.songTemplate, entry.variables);
              const newAlbum = processTemplate(entry.rule.albumTemplate, entry.variables);
              const newFilename = processTemplate(entry.rule.filenameTemplate, entry.variables) + '.mp3';
              results.matches.push({
                originalFilename: entry.file.filename,
                originalPath: entry.file.filePath,
                newFilename: newFilename || entry.file.filename,
                newArtist: newArtist || entry.file.artist,
                newTitle: newTitle || entry.file.title,
                newAlbum: newAlbum || entry.file.album,
                originalArtist: entry.file.artist,
                originalTitle: entry.file.title,
                originalAlbum: entry.file.album,
                ruleId: entry.rule.id,
                variables: entry.variables
              });
              assigned.add(entry);
              withTrack = withTrack.filter(e => e !== entry);
            } else if (withoutTrack.length > 0) {
              // Assign this track number to a song without a track number
              const entry = withoutTrack.shift();
              entry.variables.number = currentTrack;
              const newArtist = processTemplate(entry.rule.artistTemplate, entry.variables);
              const newTitle = processTemplate(entry.rule.songTemplate, entry.variables);
              const newAlbum = processTemplate(entry.rule.albumTemplate, entry.variables);
              const newFilename = processTemplate(entry.rule.filenameTemplate, entry.variables) + '.mp3';
              results.matches.push({
                originalFilename: entry.file.filename,
                originalPath: entry.file.filePath,
                newFilename: newFilename || entry.file.filename,
                newArtist: newArtist || entry.file.artist,
                newTitle: newTitle || entry.file.title,
                newAlbum: newAlbum || entry.file.album,
                originalArtist: entry.file.artist,
                originalTitle: entry.file.title,
                originalAlbum: entry.file.album,
                ruleId: entry.rule.id,
                variables: entry.variables
              });
              assigned.add(entry);
            } else if (withTrack.length > 0) {
              // No unassigned songs left, reassign the song with the largest track number
              let maxEntry = withTrack[0];
              let maxNum = parseInt(maxEntry.file.trackNumber) || 0;
              for (const entry of withTrack) {
                const n = parseInt(entry.file.trackNumber) || 0;
                if (n > maxNum) {
                  maxNum = n;
                  maxEntry = entry;
                }
              }
              maxEntry.variables.number = currentTrack;
              const newArtist = processTemplate(maxEntry.rule.artistTemplate, maxEntry.variables);
              const newTitle = processTemplate(maxEntry.rule.songTemplate, maxEntry.variables);
              const newAlbum = processTemplate(maxEntry.rule.albumTemplate, maxEntry.variables);
              const newFilename = processTemplate(maxEntry.rule.filenameTemplate, maxEntry.variables) + '.mp3';
              results.matches.push({
                originalFilename: maxEntry.file.filename,
                originalPath: maxEntry.file.filePath,
                newFilename: newFilename || maxEntry.file.filename,
                newArtist: newArtist || maxEntry.file.artist,
                newTitle: newTitle || maxEntry.file.title,
                newAlbum: newAlbum || maxEntry.file.album,
                originalArtist: maxEntry.file.artist,
                originalTitle: maxEntry.file.title,
                originalAlbum: maxEntry.file.album,
                ruleId: maxEntry.rule.id,
                variables: maxEntry.variables
              });
              assigned.add(maxEntry);
              withTrack = withTrack.filter(e => e !== maxEntry);
            }
            currentTrack++;
          }

          console.log(`[PREVIEW] Album "${albumName}": processed ${assigned.size} files (highest existing: ${highestTrackNumber})`);
        }
        results.totalMatches = results.matches.length;

        sendNamingProgress('complete', `Analysis complete! Found ${results.totalMatches} total matches`, namingRules.length, namingRules.length, `${results.matches.length} files will be processed`);
        namingState.isRunning = false;

        return results;
  } catch (error) {
    sendNamingProgress('error', `Error during analysis: ${error.message}`, 0, 0, error.stack);
    namingState.isRunning = false;
    console.error('Error previewing naming changes:', error);
    throw error;
  }
});

ipcMain.handle('apply-naming-changes', async (event, namingRules, filesData) => {
  try {
    // Set up progress tracking
    namingState.currentWindow = BrowserWindow.fromWebContents(event.sender);
    namingState.isRunning = true;

    sendNamingProgress('starting', 'Initializing file updates...', 0, namingRules.length);

    // First, collect ALL matches from ALL rules
    const allMatches = [];
    const albumGroupsMap = new Map(); // albumName -> array of entries
    const processedFiles = new Set(); // Track files already processed to prevent duplicates

    for (let ruleIndex = 0; ruleIndex < namingRules.length; ruleIndex++) {
      const rule = namingRules[ruleIndex];
      sendNamingProgress('processing', `Processing rule ${ruleIndex + 1}: ${rule.albumTemplate || 'Unnamed Rule'}`, ruleIndex + 1, namingRules.length);
      
      // Track files processed within this specific rule to prevent duplicates
      const ruleProcessedFiles = new Set();
      
      // Support both old format (lyricSearch) and new format (lyricSearches)
      let lyricSearches = rule.lyricSearches || [];
      if (rule.lyricSearch && !lyricSearches.length) {
        lyricSearches = [rule.lyricSearch]; // Backward compatibility
      }

      // Skip rule if no valid searches
      const validSearches = lyricSearches.filter(search => search && search.trim() !== '');
      if (validSearches.length === 0) continue;

      // Collect files that match this rule
      for (const file of filesData) {
        // Skip files already processed by previous rules
        if (processedFiles.has(file.filePath)) {
          continue;
        }

        // Skip files already processed within this specific rule
        if (ruleProcessedFiles.has(file.filePath)) {
          continue;
        }

        // Check if lyrics contain ANY of the search texts
        const lyrics = file.lyrics || '';
        const lyricsLower = lyrics.toLowerCase();

        let foundMatch = false;
        for (const searchText of validSearches) {
          if (lyricsLower.includes(searchText.toLowerCase())) {
            foundMatch = true;
            break;
          }
        }

        if (foundMatch) {
          // Generate album name for this file
          const variables = {
            number: 1, // placeholder - will be set later
            artist: file.artist || 'Unknown Artist',
            title: file.title || 'Unknown Title',
            album: file.album || 'Unknown Album',
            genre: file.genre || 'Unknown',
            year: file.year || new Date().getFullYear()
          };

          const targetAlbum = processTemplate(rule.albumTemplate || '{album}', variables);

          const matchEntry = {
            file,
            variables,
            targetAlbum,
            rule,
            ruleId: rule.id
          };

          allMatches.push(matchEntry);

          // Mark file as processed to prevent duplicates across all rules
          processedFiles.add(file.filePath);

          // Mark file as processed within this specific rule
          ruleProcessedFiles.add(file.filePath);

          // Group by album for numbering
          if (!albumGroupsMap.has(targetAlbum)) {
            albumGroupsMap.set(targetAlbum, []);
          }
          albumGroupsMap.get(targetAlbum).push(matchEntry);
        }
      }
    }

    // Now apply numbering logic to all collected matches
    const previewResult = {
      totalMatches: 0,
      matches: []
    };

    // Process each album group and assign track numbers
    for (const [albumName, albumFiles] of albumGroupsMap) {
      // Group into with and without track numbers
      let withTrack = [];
      let withoutTrack = [];
      const trackNumberMap = new Map();

      // First, group and handle duplicates
      albumFiles.forEach(entry => {
        const trackNum = parseInt(entry.file.trackNumber);
        if (trackNum > 0) {
          if (!trackNumberMap.has(trackNum)) {
            trackNumberMap.set(trackNum, [entry]);
          } else {
            trackNumberMap.get(trackNum).push(entry);
          }
        } else {
          withoutTrack.push(entry);
        }
      });

      // Move extras (duplicates) to withoutTrack
      for (const [trackNum, entries] of trackNumberMap.entries()) {
        if (entries.length > 1) {
          // Keep one, move the rest
          withTrack.push(entries[0]);
          for (let i = 1; i < entries.length; i++) {
            withoutTrack.push(entries[i]);
          }
        } else {
          withTrack.push(entries[0]);
        }
      }

      // Find the highest track number present
      let highestTrackNumber = 0;
      for (const entry of withTrack) {
        const n = parseInt(entry.file.trackNumber) || 0;
        if (n > highestTrackNumber) highestTrackNumber = n;
      }

      // Assign track numbers starting from 1
      let currentTrack = 1;
      let assigned = new Set();
      let totalToAssign = withTrack.length + withoutTrack.length;
      while (assigned.size < totalToAssign) {
        // 1. If a song with this track number exists, update it
        let entry = withTrack.find(e => parseInt(e.file.trackNumber) === currentTrack);
        if (entry) {
          entry.variables.number = currentTrack;
          // Update all properties using rules
          const newArtist = processTemplate(entry.rule.artistTemplate, entry.variables);
          const newTitle = processTemplate(entry.rule.songTemplate, entry.variables);
          const newAlbum = processTemplate(entry.rule.albumTemplate, entry.variables);
          const newFilename = processTemplate(entry.rule.filenameTemplate, entry.variables) + '.mp3';
          previewResult.matches.push({
            originalFilename: entry.file.filename,
            originalPath: entry.file.filePath,
            newFilename: newFilename || entry.file.filename,
            newArtist: newArtist || entry.file.artist,
            newTitle: newTitle || entry.file.title,
            newAlbum: newAlbum || entry.file.album,
            originalArtist: entry.file.artist,
            originalTitle: entry.file.title,
            originalAlbum: entry.file.album,
            ruleId: entry.rule.id,
            variables: entry.variables
          });
          assigned.add(entry);
        } else if (withoutTrack.length > 0) {
          // 2. Assign to a song without a track number
          entry = withoutTrack.shift();
          entry.variables.number = currentTrack;
          const newArtist = processTemplate(entry.rule.artistTemplate, entry.variables);
          const newTitle = processTemplate(entry.rule.songTemplate, entry.variables);
          const newAlbum = processTemplate(entry.rule.albumTemplate, entry.variables);
          const newFilename = processTemplate(entry.rule.filenameTemplate, entry.variables) + '.mp3';
          previewResult.matches.push({
            originalFilename: entry.file.filename,
            originalPath: entry.file.filePath,
            newFilename: newFilename || entry.file.filename,
            newArtist: newArtist || entry.file.artist,
            newTitle: newTitle || entry.file.title,
            newAlbum: newAlbum || entry.file.album,
            originalArtist: entry.file.artist,
            originalTitle: entry.file.title,
            originalAlbum: entry.file.album,
            ruleId: entry.rule.id,
            variables: entry.variables
          });
          assigned.add(entry);
        } else if (withTrack.length > 0) {
          // 3. No unassigned left, reassign the song with the largest track number
          let maxEntry = withTrack[0];
          let maxNum = parseInt(maxEntry.file.trackNumber) || 0;
          for (const e of withTrack) {
            const n = parseInt(e.file.trackNumber) || 0;
            if (!assigned.has(e) && n > maxNum) {
              maxNum = n;
              maxEntry = e;
            }
          }
          maxEntry.variables.number = currentTrack;
          const newArtist = processTemplate(maxEntry.rule.artistTemplate, maxEntry.variables);
          const newTitle = processTemplate(maxEntry.rule.songTemplate, maxEntry.variables);
          const newAlbum = processTemplate(maxEntry.rule.albumTemplate, maxEntry.variables);
          const newFilename = processTemplate(maxEntry.rule.filenameTemplate, maxEntry.variables) + '.mp3';
          previewResult.matches.push({
            originalFilename: maxEntry.file.filename,
            originalPath: maxEntry.file.filePath,
            newFilename: newFilename || maxEntry.file.filename,
            newArtist: newArtist || maxEntry.file.artist,
            newTitle: newTitle || maxEntry.file.title,
            newAlbum: newAlbum || maxEntry.file.album,
            originalArtist: maxEntry.file.artist,
            originalTitle: maxEntry.file.title,
            originalAlbum: maxEntry.file.album,
            ruleId: maxEntry.rule.id,
            variables: maxEntry.variables
          });
          assigned.add(maxEntry);
        }
        currentTrack++;
      }

      console.log(`[APPLY] Album "${albumName}": processed ${assigned.size} files (highest existing: ${highestTrackNumber})`);
    }
    
    previewResult.totalMatches = previewResult.matches.length;

  let updated = 0;
  const results = [];

  sendNamingProgress('applying', `Updating ${previewResult.matches.length} files...`, 0, previewResult.matches.length);

  for (let fileIndex = 0; fileIndex < previewResult.matches.length; fileIndex++) {

    const match = previewResult.matches[fileIndex];

    // Send progress update every 5 files
    if (fileIndex % 5 === 0) {
      sendNamingProgress('applying', `Updating files: ${fileIndex + 1}/${previewResult.matches.length}`, fileIndex + 1, previewResult.matches.length, `Current: ${match.originalFilename}`);
    }
    try {
      // Check if file exists and is accessible
      if (!fs.existsSync(match.originalPath)) {
        console.error(`File not found: ${match.originalPath}`);
        results.push({
          filename: match.originalFilename,
          success: false,
          error: 'File not found'
        });
        continue;
      }

      // Read the current metadata with error handling
      let tags;
      try {
        tags = NodeID3.read(match.originalPath);
      } catch (readError) {
        console.error(`Error reading metadata from ${match.originalFilename}:`, readError);
        results.push({
          filename: match.originalFilename,
          success: false,
          error: 'Cannot read MP3 metadata - file may be corrupted or not a valid MP3'
        });
        continue;
      }

      // Ensure tags object exists
      if (!tags) {
        tags = {};
      }

      // Update metadata fields
      if (match.newArtist !== match.originalArtist) {
        tags.artist = match.newArtist;
      }
      if (match.newTitle !== match.originalTitle) {
        tags.title = match.newTitle;
      }
      if (match.newAlbum !== match.originalAlbum) {
        tags.album = match.newAlbum;
      }
      
      // Update track number if it's different from current
      const newTrackNumber = match.variables.number;
      if (newTrackNumber && tags.trackNumber !== newTrackNumber.toString()) {
        tags.trackNumber = newTrackNumber.toString();
      }

      // Write updated metadata with error handling
      try {
        NodeID3.write(tags, match.originalPath);
      } catch (writeError) {
        console.error(`Error writing metadata to ${match.originalFilename}:`, writeError);
        results.push({
          filename: match.originalFilename,
          success: false,
          error: 'Cannot write MP3 metadata - file may be read-only or corrupted'
        });
        continue;
      }

      // Rename file if filename template was provided
      if (match.newFilename !== match.originalFilename) {
        const dir = path.dirname(match.originalPath);
        let newPath = path.join(dir, match.newFilename);
        let finalFilename = match.newFilename;

        // If the target filename exists, use Temp_ prefix
        if (fs.existsSync(newPath)) {
          finalFilename = 'Temp_' + match.newFilename;
          newPath = path.join(dir, finalFilename);
        }

        try {
          fs.renameSync(match.originalPath, newPath);
          // Update the result with the actual final filename used
          match.newFilename = finalFilename;
        } catch (renameError) {
          console.error(`Error renaming ${match.originalFilename}:`, renameError);
          // Metadata was updated successfully, but rename failed
          results.push({
            filename: match.originalFilename,
            success: true,
            warning: 'Metadata updated but file rename failed: ' + renameError.message,
            newFilename: match.originalFilename, // Keep original name
            changes: {
              artist: match.newArtist,
              title: match.newTitle,
              album: match.newAlbum
            }
          });
          updated++;
          continue;
        }
      }

      updated++;
      results.push({
        filename: match.originalFilename,
        success: true,
        newFilename: match.newFilename,
        changes: {
          artist: match.newArtist,
          title: match.newTitle,
          album: match.newAlbum
        }
      });

    } catch (error) {
      console.error(`Error updating ${match.originalFilename}:`, error);
      results.push({
        filename: match.originalFilename,
        success: false,
        error: error.message
      });
    }
  }

  // Second pass: rename Temp_ files to their final names
  for (const match of previewResult.matches) {
    if (match.newFilename && match.newFilename.startsWith('Temp_')) {
      const dir = path.dirname(match.originalPath);
      const tempPath = path.join(dir, match.newFilename);
      const finalPath = path.join(dir, match.newFilename.replace(/^Temp_/, ''));
      if (fs.existsSync(tempPath) && !fs.existsSync(finalPath)) {
        try {
          fs.renameSync(tempPath, finalPath);
          match.newFilename = match.newFilename.replace(/^Temp_/, '');
        } catch (renameError) {
          console.error(`Error finalizing rename for ${tempPath}:`, renameError);
        }
      }
    }
  }

  sendNamingProgress('complete', `File updates complete! Updated ${updated} files`, namingRules.length, namingRules.length, `${results.length} files processed`);
  namingState.isRunning = false;

  return { updated, results };
} catch (error) {
  sendNamingProgress('error', `Error during file updates: ${error.message}`, 0, 0, error.stack);
  namingState.isRunning = false;
  console.error('Error applying naming changes:', error);
  throw error;
}
});

// Save and Load Naming Rules functionality
ipcMain.handle('save-naming-rules', async (event, rulesData) => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog({
      title: 'Save Naming Rules',
      defaultPath: 'naming-rules.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      const jsonString = JSON.stringify(rulesData, null, 2);
      fs.writeFileSync(result.filePath, jsonString, 'utf8');

      return {
        success: true,
        filePath: result.filePath
      };
    } else {
      return {
        success: false,
        message: 'Save cancelled'
      };
    }
  } catch (error) {
    console.error('Error saving naming rules:', error);
    throw error;
  }
});

ipcMain.handle('load-naming-rules', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: 'Load Naming Rules',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];

      if (!fs.existsSync(filePath)) {
        throw new Error('File not found: ' + filePath);
      }

      const jsonString = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(jsonString);

      return {
        success: true,
        data: data,
        filePath: filePath
      };
    } else {
      return {
        success: false,
        message: 'Load cancelled'
      };
    }
  } catch (error) {
    console.error('Error loading naming rules:', error);
    throw error;
  }
});

// Helper function to process template strings
function processTemplate(template, variables) {
  if (!template) return '';

  let result = template;

  // Replace variables like {artist}, {title}, etc.
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    let value = variables[key];

    // Special handling for genre in filenames - convert semicolons to commas
    if (key === 'genre' && value && typeof value === 'string') {
      value = value.replace(/;/g, ',');
    }

    result = result.replace(regex, value);
  });

  // Handle numbered formatting like {number:03d}
  const numberMatch = result.match(/\{number:(\d+)d\}/);
  if (numberMatch) {
    const padding = parseInt(numberMatch[1]);
    const paddedNumber = variables.number.toString().padStart(padding, '0');
    result = result.replace(/\{number:\d+d\}/, paddedNumber);
  }

  return result;
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// Scraper functionality
let scraperState = {
  isRunning: false,
  browser: null,
  currentWindow: null,
  totalFiles: 0,
  processedFiles: 0,
  successfulFiles: 0,
  errorFiles: 0,
  skippedFiles: 0
};

// Helper function to send log messages to renderer
function sendScrapingLog(type, message, filename = '', url = '') {
  if (scraperState.currentWindow && !scraperState.currentWindow.isDestroyed()) {
    const timestamp = new Date().toLocaleTimeString();
    scraperState.currentWindow.webContents.send('scraping-log', {
      type,
      message,
      filename,
      url,
      timestamp
    });
  }
}

// Helper function to send progress updates
function sendScrapingProgress() {
  if (scraperState.currentWindow && !scraperState.currentWindow.isDestroyed()) {
    scraperState.currentWindow.webContents.send('scraping-progress', {
      total: scraperState.totalFiles,
      processed: scraperState.processedFiles,
      successful: scraperState.successfulFiles,
      errors: scraperState.errorFiles,
      skipped: scraperState.skippedFiles,
      isRunning: scraperState.isRunning
    });
  }
}

// Function to get Suno URL from file metadata
function getSunoUrl(filePath) {
  try {
    const tags = NodeID3.read(filePath);
    return tags.audioSourceUrl || null;
  } catch (error) {
    console.error('Error reading file:', error.message);
    return null;
  }
}

// Function to check if file already has genre and lyrics
function hasGenreAndLyrics(filePath) {
  try {
    const tags = NodeID3.read(filePath);
    const hasGenre = tags.genre && tags.genre.trim().length > 0;
    const hasLyrics = tags.unsynchronisedLyrics &&
      tags.unsynchronisedLyrics.text &&
      tags.unsynchronisedLyrics.text.trim().length > 0;

    // Consider [Instrumental] as valid "lyrics" to prevent re-scraping instrumental tracks
    const isMarkedInstrumental = hasLyrics && tags.unsynchronisedLyrics.text.trim() === '[Instrumental]';

    return hasGenre && (hasLyrics || isMarkedInstrumental);
  } catch (error) {
    console.error('Error checking metadata:', error.message);
    return false;
  }
}

// Function to validate scraped data quality
function validateScrapedData(scrapedData) {
  if (!scrapedData) return false;

  const hasValidGenres = scrapedData.genres &&
    scrapedData.genres.found &&
    scrapedData.genres.genres &&
    scrapedData.genres.genres.length > 0;

  const hasValidLyrics = scrapedData.lyrics &&
    scrapedData.lyrics.found &&
    scrapedData.lyrics.lyrics &&
    scrapedData.lyrics.lyrics.length > 20;

  return hasValidGenres || hasValidLyrics;
}

// Function to scrape a single Suno URL
async function scrapeSunoUrl(browser, url, filePath) {
  const page = await browser.newPage();

  try {
    sendScrapingLog('processing', `Scraping: ${url}`, path.basename(filePath), url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Extract both genres and lyrics in one page evaluation
    const songData = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));

      // Find genre info using "Copy styles to clipboard" button
      let genreInfo = { found: false, error: 'Could not find genre info structure' };
      const stylesButton = buttons.find(button => button.title === 'Copy styles to clipboard');

      if (stylesButton) {
        const parentDiv = stylesButton.parentElement;
        const firstChild = parentDiv.firstElementChild.firstElementChild;

        if (firstChild) {
          const aTags = firstChild.querySelectorAll('a');
          const genres = Array.from(aTags).map(a => a.textContent.trim());

          genreInfo = {
            found: true,
            genres: genres,
            genreCount: genres.length
          };
        }
      }

      // Find lyrics using "Copy lyrics to clipboard" button
      let lyricsInfo = { found: false, error: 'Could not find lyrics structure' };
      const lyricsButton = buttons.find(button => button.title === 'Copy lyrics to clipboard');

      if (lyricsButton) {
        const parentDiv = lyricsButton.parentElement;
        const pTag = parentDiv.querySelector('p');

        if (pTag) {
          lyricsInfo = {
            found: true,
            lyrics: pTag.textContent.trim()
          };
        }
      }

      return {
        genres: genreInfo,
        lyrics: lyricsInfo
      };
    });

    // Update MP3 metadata with scraped data
    try {
      const existingTags = NodeID3.read(filePath);
      const updateTags = { ...existingTags };

      let hasUpdates = false;

      if (songData.genres.found && songData.genres.genres.length > 0) {
        updateTags.genre = songData.genres.genres.join('; ');
        hasUpdates = true;
      }

      if (songData.lyrics.found && songData.lyrics.lyrics) {
        updateTags.unsynchronisedLyrics = {
          language: 'eng',
          text: songData.lyrics.lyrics
        };
        hasUpdates = true;
      } else if (songData.genres.found) {
        // If we found genre info but no lyrics, mark as instrumental
        // This prevents re-scraping the same file repeatedly
        updateTags.unsynchronisedLyrics = {
          language: 'eng',
          text: '[Instrumental]'
        };
        hasUpdates = true;
        sendScrapingLog('info', `No lyrics found, marked as instrumental`, path.basename(filePath));
      }

      if (hasUpdates) {
        const success = NodeID3.update(updateTags, filePath);
        if (success) {
          sendScrapingLog('success', `Successfully updated metadata`, path.basename(filePath));
          return songData;
        } else {
          sendScrapingLog('error', `Failed to update metadata`, path.basename(filePath));
          return null;
        }
      } else {
        sendScrapingLog('warning', `No valid data found to update`, path.basename(filePath));
        return null;
      }

    } catch (error) {
      sendScrapingLog('error', `Error updating metadata: ${error.message}`, path.basename(filePath));
      return null;
    }

  } catch (error) {
    sendScrapingLog('error', `Scraping error: ${error.message}`, path.basename(filePath), url);
    return null;
  } finally {
    await page.close();
  }
}

// IPC handler to start scraping
ipcMain.handle('start-scraping', async (event, folderPath) => {
  if (scraperState.isRunning) {
    return { success: false, error: 'Scraping is already running' };
  }

  try {
    // Store current window reference for logging
    scraperState.currentWindow = BrowserWindow.fromWebContents(event.sender);

    // Get all MP3 files
    const files = fs.readdirSync(folderPath);
    const mp3Files = files.filter(file => file.toLowerCase().endsWith('.mp3'));

    scraperState.totalFiles = mp3Files.length;
    scraperState.processedFiles = 0;
    scraperState.successfulFiles = 0;
    scraperState.errorFiles = 0;
    scraperState.skippedFiles = 0;
    scraperState.isRunning = true;

    sendScrapingLog('info', `Found ${mp3Files.length} MP3 files to process`);
    sendScrapingProgress();

    // Create browser for scraping
    scraperState.browser = await puppeteer.launch({ headless: false });

    // Process files
    for (let i = 0; i < mp3Files.length && scraperState.isRunning; i++) {
      const fileName = mp3Files[i];
      const fullPath = path.join(folderPath, fileName);

      sendScrapingLog('info', `Processing ${i + 1}/${mp3Files.length}`, fileName);

      // Restart browser every 100 files for memory management
      if (i > 0 && i % 100 === 0) {
        sendScrapingLog('info', 'Restarting browser for memory management...');
        await scraperState.browser.close();
        scraperState.browser = await puppeteer.launch({ headless: false });
      }

      // Check if file already has genre and lyrics
      if (hasGenreAndLyrics(fullPath)) {
        sendScrapingLog('info', 'File already has genre and lyrics, skipping', fileName);
        scraperState.skippedFiles++;
        scraperState.processedFiles++;
        sendScrapingProgress();
        continue;
      }

      // Get Suno URL from metadata
      const sunoUrl = getSunoUrl(fullPath);

      if (sunoUrl && sunoUrl.includes('suno.com')) {
        try {
          const scrapedData = await scrapeSunoUrl(scraperState.browser, sunoUrl, fullPath);

          if (validateScrapedData(scrapedData)) {
            scraperState.successfulFiles++;
          } else {
            scraperState.errorFiles++;
            sendScrapingLog('warning', 'Scraped data validation failed', fileName);
          }
        } catch (error) {
          scraperState.errorFiles++;
          sendScrapingLog('error', `Error processing file: ${error.message}`, fileName);
        }
      } else {
        scraperState.skippedFiles++;
        sendScrapingLog('info', 'No Suno URL found, skipping', fileName);
      }

      scraperState.processedFiles++;
      sendScrapingProgress();

      // Add delay between requests (2-5 seconds)
      if (i < mp3Files.length - 1 && scraperState.isRunning) {
        const delay = Math.floor(Math.random() * 3000) + 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Close browser
    if (scraperState.browser) {
      await scraperState.browser.close();
      scraperState.browser = null;
    }

    scraperState.isRunning = false;

    sendScrapingLog('info', `Session complete! Processed: ${scraperState.successfulFiles}, Errors: ${scraperState.errorFiles}, Skipped: ${scraperState.skippedFiles}`);
    sendScrapingProgress();

    return {
      success: true,
      stats: {
        total: scraperState.totalFiles,
        processed: scraperState.processedFiles,
        successful: scraperState.successfulFiles,
        errors: scraperState.errorFiles,
        skipped: scraperState.skippedFiles
      }
    };

  } catch (error) {
    scraperState.isRunning = false;
    if (scraperState.browser) {
      await scraperState.browser.close();
      scraperState.browser = null;
    }
    sendScrapingLog('error', `Scraping failed: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// IPC handler to stop scraping
ipcMain.handle('stop-scraping', async () => {
  scraperState.isRunning = false;

  if (scraperState.browser) {
    try {
      await scraperState.browser.close();
      scraperState.browser = null;
      sendScrapingLog('info', 'Scraping stopped by user');
    } catch (error) {
      console.error('Error stopping browser:', error);
    }
  }

  sendScrapingProgress();
  return { success: true };
});
