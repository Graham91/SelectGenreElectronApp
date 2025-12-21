const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('fs');
const NodeID3 = require('node-id3');

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

// Naming via Lyrics functionality
ipcMain.handle('preview-naming-changes', async (event, namingRules, filesData) => {
  try {
    const results = {
      totalMatches: 0,
      matches: []
    };
    
    for (const rule of namingRules) {
      // Support both old format (lyricSearch) and new format (lyricSearches)
      let lyricSearches = rule.lyricSearches || [];
      if (rule.lyricSearch && !lyricSearches.length) {
        lyricSearches = [rule.lyricSearch]; // Backward compatibility
      }
      
      // Skip rule if no valid searches
      const validSearches = lyricSearches.filter(search => search && search.trim() !== '');
      if (validSearches.length === 0) continue;
      
      let matchCount = 0;
      
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
          matchCount++;
          
          // Generate templates with variables
          const variables = {
            number: rule.startNumber + matchCount - 1,
            artist: file.artist || 'Unknown Artist',
            title: file.title || 'Unknown Title',
            album: file.album || 'Unknown Album',
            genre: file.genre || 'Unknown',
            year: file.year || new Date().getFullYear()
          };
          
          // Process templates
          const newArtist = processTemplate(rule.artistTemplate, variables);
          const newTitle = processTemplate(rule.songTemplate, variables);
          const newAlbum = processTemplate(rule.albumTemplate, variables);
          const newFilename = processTemplate(rule.filenameTemplate, variables) + '.mp3';
          
          results.matches.push({
            originalFilename: file.filename,
            originalPath: file.filePath,
            newFilename: newFilename || file.filename,
            newArtist: newArtist || file.artist,
            newTitle: newTitle || file.title,
            newAlbum: newAlbum || file.album,
            originalArtist: file.artist,
            originalTitle: file.title,
            originalAlbum: file.album,
            ruleId: rule.id,
            variables: variables
          });
        }
      }
    }
    
    results.totalMatches = results.matches.length;
    return results;
  } catch (error) {
    console.error('Error previewing naming changes:', error);
    throw error;
  }
});

ipcMain.handle('apply-naming-changes', async (event, namingRules, filesData) => {
  try {
    // Generate preview data directly (don't register another handler)
    const previewResult = {
      totalMatches: 0,
      matches: []
    };
    
    for (const rule of namingRules) {
      // Support both old format (lyricSearch) and new format (lyricSearches)
      let lyricSearches = rule.lyricSearches || [];
      if (rule.lyricSearch && !lyricSearches.length) {
        lyricSearches = [rule.lyricSearch]; // Backward compatibility
      }
      
      // Skip rule if no valid searches
      const validSearches = lyricSearches.filter(search => search && search.trim() !== '');
      if (validSearches.length === 0) continue;
      
      let matchCount = 0;
      
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
          matchCount++;
          
          const variables = {
            number: rule.startNumber + matchCount - 1,
            artist: file.artist || 'Unknown Artist',
            title: file.title || 'Unknown Title',
            album: file.album || 'Unknown Album',
            genre: file.genre || 'Unknown',
            year: file.year || new Date().getFullYear()
          };
          
          const newArtist = processTemplate(rule.artistTemplate, variables);
          const newTitle = processTemplate(rule.songTemplate, variables);
          const newAlbum = processTemplate(rule.albumTemplate, variables);
          
          // Only generate new filename if template is provided
          let newFilename = file.filename; // Default to original
          if (rule.filenameTemplate && rule.filenameTemplate.trim() !== '') {
            const processedTemplate = processTemplate(rule.filenameTemplate, variables);
            if (processedTemplate && processedTemplate.trim() !== '') {
              newFilename = processedTemplate + '.mp3';
            }
          }
          
          previewResult.matches.push({
            originalFilename: file.filename,
            originalPath: file.filePath,
            newFilename: newFilename,
            newArtist: newArtist || file.artist,
            newTitle: newTitle || file.title,
            newAlbum: newAlbum || file.album,
            originalArtist: file.artist,
            originalTitle: file.title,
            originalAlbum: file.album,
            ruleId: rule.id,
            variables: variables
          });
        }
      }
    }
    
    previewResult.totalMatches = previewResult.matches.length;
    
    let updated = 0;
    const results = [];
    
    for (const match of previewResult.matches) {
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
    
    return { updated, results };
  } catch (error) {
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
