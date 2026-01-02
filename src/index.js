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

    const results = {
      totalMatches: 0,
      matches: []
    };

    for (let ruleIndex = 0; ruleIndex < namingRules.length; ruleIndex++) {
      const rule = namingRules[ruleIndex];
      sendNamingProgress('processing', `Processing rule ${ruleIndex + 1}: ${rule.albumTemplate || 'Unnamed Rule'}`, ruleIndex + 1, namingRules.length);
      // Support both old format (lyricSearch) and new format (lyricSearches)
      let lyricSearches = rule.lyricSearches || [];
      if (rule.lyricSearch && !lyricSearches.length) {
        lyricSearches = [rule.lyricSearch]; // Backward compatibility
      }

      // Skip rule if no valid searches
      const validSearches = lyricSearches.filter(search => search && search.trim() !== '');
      if (validSearches.length === 0) continue;

      // Simple approach: collect files by album and number them sequentially
      const albumFilesMap = new Map(); // album -> array of files
      // Collect files that match this rule, grouped by album
      for (const file of filesData) {
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
            number: 1, // placeholder
            artist: file.artist || 'Unknown Artist',
            title: file.title || 'Unknown Title',
            album: file.album || 'Unknown Album',
            genre: file.genre || 'Unknown',
            year: file.year || new Date().getFullYear()
          };

          const targetAlbum = processTemplate(rule.albumTemplate || '{album}', variables);

          // Add file to album group
          if (!albumFilesMap.has(targetAlbum)) {
            albumFilesMap.set(targetAlbum, []);
          }
          albumFilesMap.get(targetAlbum).push({ file, variables, targetAlbum });
        }
      }

      // Process each album group and assign track numbers only to files that need them
      for (const [albumName, albumFiles] of albumFilesMap) {
        // First, check existing track numbers for files in this album
        const existingTrackNumbers = new Set();
        let highestTrackNumber = 0;
        
        albumFiles.forEach(entry => {
          const existingTrackNumber = parseInt(entry.file.trackNumber) || 0;
          if (existingTrackNumber > 0) {
            existingTrackNumbers.add(existingTrackNumber);
            highestTrackNumber = Math.max(highestTrackNumber, existingTrackNumber);
          }
        });
        
        // Sort files consistently (by title) for predictable numbering
        albumFiles.sort((a, b) => (a.file.title || '').localeCompare(b.file.title || ''));
        
        // Assign track numbers  
        let nextAvailableNumber = Math.max(highestTrackNumber + 1, rule.startNumber || 1);
        
        albumFiles.forEach((entry) => {
          const existingTrackNumber = parseInt(entry.file.trackNumber) || 0;
          
          if (existingTrackNumber > 0) {
            // Keep existing track number
            entry.variables.number = existingTrackNumber;
            console.log(`[PREVIEW] Keeping existing track number ${existingTrackNumber} for: ${entry.file.title}`);
          } else {
            // Assign new track number
            entry.variables.number = nextAvailableNumber;
            console.log(`[PREVIEW] Assigning new track number ${nextAvailableNumber} to: ${entry.file.title}`);
            nextAvailableNumber++;
          }

          // Process templates with final assigned number
          const newArtist = processTemplate(rule.artistTemplate, entry.variables);
          const newTitle = processTemplate(rule.songTemplate, entry.variables);
          const newAlbum = processTemplate(rule.albumTemplate, entry.variables);
          const newFilename = processTemplate(rule.filenameTemplate, entry.variables) + '.mp3';

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
            ruleId: rule.id,
            variables: entry.variables
          });
        });

        console.log(`[PREVIEW] Album "${albumName}": processed ${albumFiles.length} files (highest existing: ${highestTrackNumber}, next available: ${nextAvailableNumber})`);
      }
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

    // Generate preview data directly (don't register another handler)
    const previewResult = {
      totalMatches: 0,
      matches: []
    };

    for (let ruleIndex = 0; ruleIndex < namingRules.length; ruleIndex++) {
      const rule = namingRules[ruleIndex];
      sendNamingProgress('processing', `Processing rule ${ruleIndex + 1}: ${rule.albumTemplate || 'Unnamed Rule'}`, ruleIndex + 1, namingRules.length);
      // Support both old format (lyricSearch) and new format (lyricSearches)
      let lyricSearches = rule.lyricSearches || [];
      if (rule.lyricSearch && !lyricSearches.length) {
        lyricSearches = [rule.lyricSearch]; // Backward compatibility
      }

      // Skip rule if no valid searches
      const validSearches = lyricSearches.filter(search => search && search.trim() !== '');
      if (validSearches.length === 0) continue;

      // Simple approach: collect files by album and number them sequentially
      const albumFilesMap = new Map(); // album -> array of files

      // Collect files that match this rule, grouped by album
      for (const file of filesData) {
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
            number: 1, // placeholder
            artist: file.artist || 'Unknown Artist',
            title: file.title || 'Unknown Title',
            album: file.album || 'Unknown Album',
            genre: file.genre || 'Unknown',
            year: file.year || new Date().getFullYear()
          };

          const targetAlbum = processTemplate(rule.albumTemplate || '{album}', variables);

          // Add file to album group
          if (!albumFilesMap.has(targetAlbum)) {
            albumFilesMap.set(targetAlbum, []);
          }
          albumFilesMap.get(targetAlbum).push({ file, variables, targetAlbum });
        }
      }

      // Process each album group and assign track numbers only to files that need them
      for (const [albumName, albumFiles] of albumFilesMap) {
        // First, check existing track numbers for files in this album
        const existingTrackNumbers = new Set();
        let highestTrackNumber = 0;
        
        albumFiles.forEach(entry => {
          const existingTrackNumber = parseInt(entry.file.trackNumber) || 0;
          if (existingTrackNumber > 0) {
            existingTrackNumbers.add(existingTrackNumber);
            highestTrackNumber = Math.max(highestTrackNumber, existingTrackNumber);
          }
        });
        
        // Sort files consistently (by title) for predictable numbering
        albumFiles.sort((a, b) => (a.file.title || '').localeCompare(b.file.title || ''));
        
        // Assign track numbers  
        let nextAvailableNumber = Math.max(highestTrackNumber + 1, rule.startNumber || 1);
        
        albumFiles.forEach((entry) => {
          const existingTrackNumber = parseInt(entry.file.trackNumber) || 0;
          
          if (existingTrackNumber > 0) {
            // Keep existing track number
            entry.variables.number = existingTrackNumber;
            console.log(`[APPLY] Keeping existing track number ${existingTrackNumber} for: ${entry.file.title}`);
          } else {
            // Assign new track number
            entry.variables.number = nextAvailableNumber;
            console.log(`[APPLY] Assigning new track number ${nextAvailableNumber} to: ${entry.file.title}`);
            nextAvailableNumber++;
          }

          // Process templates with final assigned number
          const newArtist = processTemplate(rule.artistTemplate, entry.variables);
          const newTitle = processTemplate(rule.songTemplate, entry.variables);
          const newAlbum = processTemplate(rule.albumTemplate, entry.variables);
          const newFilename = processTemplate(rule.filenameTemplate, entry.variables) + '.mp3';

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
            ruleId: rule.id,
            variables: entry.variables
          });
        });

        console.log(`[APPLY] Album "${albumName}": processed ${albumFiles.length} files (highest existing: ${highestTrackNumber}, next available: ${nextAvailableNumber})`);
      }
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

        // Handle filename conflicts by finding next available number in sequence
        if (fs.existsSync(newPath)) {
          // Check if the filename template uses numbering
          const rule = namingRules.find(r => r.id === match.ruleId);
          if (rule && rule.filenameTemplate && rule.filenameTemplate.includes('{number')) {
            // Extract the base pattern from the filename (everything except the number)
            const originalNumber = match.variables.number;

            // Find all existing files in directory
            const existingFiles = fs.readdirSync(dir).filter(f => f.endsWith('.mp3'));

            // Extract numbers from files that match our pattern
            const usedNumbers = new Set();
            const nameWithoutExt = path.parse(finalFilename).name;

            // Create regex to match the pattern - replace the number with a capture group
            let pattern = nameWithoutExt.replace(/\d+/, '(\\d+)');
            pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special regex chars
            pattern = pattern.replace('\\(\\\\d\\+\\)', '(\\d+)'); // Restore the number capture group
            const regex = new RegExp(`^${pattern}$`);

            existingFiles.forEach(file => {
              const fileNameOnly = path.parse(file).name;
              const match = fileNameOnly.match(regex);
              if (match && match[1]) {
                usedNumbers.add(parseInt(match[1]));
              }
            });

            // Find the next available number
            let nextNumber = rule.startNumber;
            while (usedNumbers.has(nextNumber)) {
              nextNumber++;
            }

            // Regenerate filename with the next available number
            const newVariables = { ...match.variables, number: nextNumber };
            const processedTemplate = processTemplate(rule.filenameTemplate, newVariables);
            finalFilename = processedTemplate + '.mp3';
            newPath = path.join(dir, finalFilename);

            console.log(`Filename conflict resolved: ${match.newFilename} -> ${finalFilename}`);
          } else {
            // No numbering in template, skip rename to avoid conflict
            console.warn(`Target filename already exists: ${match.newFilename}`);
            results.push({
              filename: match.originalFilename,
              success: true,
              warning: 'Metadata updated but file rename skipped - target filename already exists',
              newFilename: match.originalFilename,
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
