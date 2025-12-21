# MP3 Genre Cleaner & Advanced Metadata Manager

## 📋 **Overview**

The MP3 Genre Cleaner is an advanced Electron application designed to clean up AI-generated music metadata and provide sophisticated file renaming capabilities based on lyric content. The app features a comprehensive tabbed interface with three main functions: metadata viewing, genre cleaning, and intelligent file renaming using lyric search patterns.

## 🎯 **Primary Use Cases**

### **1. Genre Cleanup**
This application was built to solve the problem of AI-generated music having messy genre strings like:
- `"rap; dark; emd; piano; atmospheric; electronic;"`
- `"jazz; experimental; dark; glitch; ambient;"`

Users can bulk-select unwanted genres and remove them from entire music collections while preserving good genre tags.

### **2. Intelligent File Renaming**
Advanced template-based file renaming system that searches song lyrics for specific text patterns and applies custom naming templates. Perfect for organizing large music collections by lyrical content, themes, or organizing compilation albums.

## 🏗️ **Application Architecture**

### **Technology Stack**
- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js with Electron
- **MP3 Metadata**: NodeID3 library
- **File System**: Node.js fs module
- **UI Framework**: Custom tabbed interface

### **File Structure**
```
SelectGenreApp/
├── src/
│   ├── index.html          # Main UI with tabbed interface
│   ├── index.css           # Styling for responsive design
│   ├── index.js            # Electron main process
│   └── preload.js          # IPC bridge for security
├── package.json            # Dependencies and scripts
├── forge.config.js         # Electron Forge configuration
├── generate-test-data.js   # Test MP3 file generator
└── APP_DOCUMENTATION.md    # This documentation
```

## 🖥️ **User Interface Structure**

### **Main Layout**
1. **Header**: Application title with gradient background
2. **Controls Bar**: Folder selection button and status display  
3. **Tabbed Interface**: Three main functional areas with visual toggle controls

### **Tab 1: 📋 View Metadata**
- **Purpose**: Browse and review all MP3 files and their metadata
- **Features**:
  - Scrollable table with comprehensive file information
  - **Column Visibility Controls**: Eye icon toggles (👁️/🙈) for each column
  - **Sortable Columns**: Click headers to sort by Title or Album
  - **Expandable Lyrics**: Click "Show" to view full song lyrics
  - **Album Art Display**: Clickable thumbnails with modal view
  - Displays: Album Art, Filename, Genres, Title, Artist, Album, Lyrics
  - File counter and sorting controls
  - Optimized for handling thousands of files

### **Tab 2: 🧹 Clean Genres**
- **Purpose**: Select and remove unwanted genres from all files
- **Features**:
  - Grid layout of all unique genres with checkboxes
  - Real-time statistics (total genres, selected for removal)
  - Preview functionality showing before/after changes
  - Bulk apply functionality with confirmation
  - Clear selection button for easy reset

### **Tab 3: 🎵 Naming via Lyrics**
- **Purpose**: Advanced file renaming based on lyric content search
- **Features**:
  - **Lyric Search Rules**: Define text patterns to search for in song lyrics
  - **Template System**: Custom naming templates with variable substitution
  - **Rule Management**: Add, remove, expand/collapse rule configurations
  - **Save/Load Rules**: Export and import rule sets as JSON files
  - **Preview Changes**: See exactly what files will be renamed before applying
  - **Batch Processing**: Apply all rules and rename multiple files at once

## 🔧 **Core Functionality**

### **1. Folder Selection & MP3 Reading**
- Uses Electron's `dialog.showOpenDialog()` for folder selection
- Scans selected folder for `.mp3` files
- Reads comprehensive ID3 metadata using NodeID3
- Extracts: title, artist, album, genre tags, year, lyrics, album artwork
- Handles read errors gracefully with fallback values
- Supports embedded album art extraction and display

### **2. Advanced Metadata Display**
- **Column Visibility System**: Toggle any column on/off with eye icons
- **Album Art Integration**: Displays thumbnails with click-to-expand modal view  
- **Lyrics Integration**: Expandable lyrics display with full-text viewing
- **Sorting Capabilities**: Multi-column sorting with visual indicators
- **Responsive Layout**: Adapts to different screen sizes and column configurations

### **2. Genre Processing Logic**
- **Genre Parsing**: Splits genre strings on `"; "` delimiter
- **Deduplication**: Creates unique set of all genres found
- **Sorting**: Alphabetical order for consistent UI
- **Statistics**: Tracks total files, unique genres, selected for removal

### **3. Genre Cleaning Rules & Edge Cases**

#### **🛡️ No Empty Genres Rule**
The application enforces that **no song can be left without at least one genre** after cleanup:

| Original Genres | All Marked for Deletion? | Action | Result |
|----------------|-------------------------|---------|---------|
| 1 genre | Yes | **Keep original** | No change |
| 2 genres | Yes | **Keep both original** | No change |
| 3+ genres | Yes | **Keep 2 shortest** | Keeps most concise genres |
| Any count | No | **Normal removal** | Remove only selected |

#### **Examples:**
```javascript
// Example 1: Single genre protection
Original: "rap"
Selected for deletion: ["rap"]
Result: "rap" // No change - minimum genre rule

// Example 2: Two genre protection  
Original: "jazz; blues"
Selected for deletion: ["jazz", "blues"]
Result: "jazz; blues" // No change - minimum genre rule

// Example 3: Keep shortest from 3+
Original: "electronic; dark; atmospheric; emd; glitch"
Selected for deletion: ["electronic", "dark", "atmospheric", "emd", "glitch"]  
Result: "emd; dark" // Keeps 2 shortest genres

// Example 4: Normal operation
Original: "rap; hip-hop; dark; bass; emd"
Selected for deletion: ["dark", "emd"]
Result: "rap; hip-hop; bass" // Normal removal
```

### **4. Preview System**
- **Before/After Comparison**: Shows original vs. new genre strings
- **Action Indicators**: Explains what rule is being applied
  - `"No change"` - File won't be modified
  - `"Removing selected genres"` - Normal genre removal
  - `"Keeping all (min genres rule)"` - 1-2 genres preserved by rule
  - `"Keeping 2 shortest (min genres rule)"` - Shortest genres kept from 3+
- **Change Counter**: Shows how many files will be modified
- **Visual Highlighting**: Changed rows are highlighted in yellow

### **5. File Modification & Safety**
- **Confirmation Dialog**: Requires user confirmation before changes
- **Atomic Operations**: Each file updated individually with error handling
- **Success/Failure Reporting**: Shows results of batch operation
- **Data Refresh**: Automatically reloads metadata after successful changes
- **Backup Recommendation**: Users should backup files before mass changes

## 🎵 **Naming via Lyrics System**

### **6. Lyric Search & Template Engine**
The application features a sophisticated file renaming system based on lyric content analysis:

#### **Rule-Based Matching**
- **Lyric Search**: Define text patterns to search for within song lyrics
- **Case-Insensitive Matching**: Flexible text matching regardless of capitalization
- **Multiple Rules**: Create unlimited naming rules for different lyric patterns
- **Rule Priority**: Rules are processed in order, first match wins

#### **Template Variables**
```javascript
{artist}     // Original or template-generated artist name
{title}      // Original or template-generated song title  
{album}      // Original or template-generated album name
{genre}      // Original genre (semicolons converted to commas in filenames)
{year}       // Year from metadata
{number}     // Sequential number starting from rule's startNumber
{number:03d} // Zero-padded sequential number (e.g., 001, 002, 003)
```

#### **Template Examples**
```javascript
// Album Template: "{genre} Compilation Vol. 1"
// Result: "Hip-Hop Compilation Vol. 1"

// Song Template: "{number:02d}. {title} - {artist}"  
// Result: "01. My Song - Various Artists"

// Filename Template: "{number:03d} - {artist} - {title} [{genre}]"
// Result: "001 - Artist Name - Song Title [Hip-Hop,Jazz].mp3"
```

### **7. Rule Management & Persistence**
- **Collapsible Interface**: Rules show preview when collapsed, full form when expanded
- **JSON Export/Import**: Save rule sets to `.json` files for reuse across projects
- **Rule Preview**: See exactly which files match before applying changes
- **Batch Operations**: Apply all rules simultaneously with comprehensive preview
- **Error Handling**: Graceful failure with detailed error reporting

#### **JSON Rule Format**
```json
{
  "version": "1.0",
  "timestamp": "2025-12-20T10:30:00.000Z",
  "rulesCount": 2,
  "rules": [
    {
      "id": 1,
      "lyricSearch": "I'd rather be the engine", 
      "albumTemplate": "Driving Songs Collection",
      "songTemplate": "{title} - {artist}",
      "artistTemplate": "Various Artists",
      "filenameTemplate": "{number:03d} - {artist} - {title}",
      "startNumber": 1
    }
  ]
}
```

### **8. Naming Process Flow**
1. **Rule Creation**: Define lyric search text and naming templates
2. **Preview Generation**: See which files match and preview new names
3. **Batch Application**: Apply all rules with atomic file operations  
4. **Metadata Updates**: Update ID3 tags with new artist, title, album information
5. **File Renaming**: Rename physical files according to filename templates
6. **Data Refresh**: Reload all metadata to reflect changes

## 📊 **Performance Optimizations**

### **Large Dataset Handling**
- **Scrollable Tables**: Handles thousands of files efficiently
- **Sticky Headers**: Maintains context while scrolling
- **Grid Layout**: Auto-adjusting genre checkboxes
- **Memory Management**: Efficient DOM updates and rendering
- **Responsive Design**: Works on various screen sizes

### **User Experience**
- **Progress Indicators**: Loading states during operations
- **Real-time Feedback**: Statistics update as selections change
- **Visual Feedback**: Hover effects, button states, highlighting
- **Error Handling**: Graceful failure with user-friendly messages

## 🔌 **IPC Communication**

### **Main Process → Renderer**
- `select-folder`: Opens folder dialog, returns selected path
- `read-mp3-metadata`: Reads all MP3 files in folder, returns comprehensive metadata array
- `update-mp3-genres`: Updates genre tags in MP3 files, returns success/failure results
- `preview-naming-changes`: Analyzes files against lyric rules, returns preview of changes
- `apply-naming-changes`: Executes file renaming and metadata updates based on rules
- `save-naming-rules`: Exports naming rules to JSON file with dialog
- `load-naming-rules`: Imports naming rules from JSON file with dialog

### **Data Structures**
```javascript
// Enhanced MP3 Metadata Object
{
  filename: "song.mp3",
  filePath: "/full/path/to/song.mp3", 
  genre: "rap; dark; piano;",
  title: "Song Title",
  artist: "Artist Name", 
  album: "Album Name",
  year: "2024",
  lyrics: "Full song lyrics text...",
  albumArt: "data:image/jpeg;base64,..." // Base64 encoded image
}

// Naming Rule Object
{
  id: 1,
  lyricSearch: "specific lyrics to find",
  albumTemplate: "{genre} Collection", 
  songTemplate: "{title} - {artist}",
  artistTemplate: "Various Artists",
  filenameTemplate: "{number:03d} - {artist} - {title}",
  startNumber: 1
}

// Naming Preview Result
{
  totalMatches: 5,
  matches: [
    {
      originalFilename: "song.mp3",
      newFilename: "001 - Artist - Title.mp3", 
      newArtist: "Various Artists",
      newTitle: "Song Title",
      newAlbum: "Hip-Hop Collection",
      ruleId: 1
    }
  ]
}
```

## 🧪 **Testing & Development**

### **Test Data Generation**
- `generate-test-data.js` creates sample MP3 files with various genre combinations
- Generates 10 test files with realistic AI-generated genre strings
- Includes common problematic genres: "dark", "emd", "experimental"
- Creates minimal but valid MP3 files with proper ID3 tags

### **Suggested Test Scenarios**
1. **Small Dataset**: 10-50 files for UI testing
2. **Large Dataset**: 1000+ files for performance testing  
3. **Edge Cases**: Files with 1, 2, 3+ genres and various removal scenarios
4. **Error Handling**: Corrupted files, permission issues, disk space

## 🚀 **Future Enhancement Areas**

### **Planned Features**
- [ ] **Advanced Lyric Matching**: Regex support, fuzzy matching, multi-phrase search
- [ ] **Conditional Templates**: If/then logic in naming templates  
- [ ] **Bulk Genre Addition**: Add genres to multiple files
- [ ] **Smart Genre Suggestions**: ML-based genre recommendations
- [ ] **Undo Functionality**: Reverse applied changes with restoration points
- [ ] **Export Reports**: CSV/JSON export of all changes made
- [ ] **Template Marketplace**: Share and download community naming templates
- [ ] **Advanced Filters**: Filter files by artist, album, existing genres, lyrics content
- [ ] **Drag & Drop**: Direct folder/file dropping interface
- [ ] **Audio Preview**: Play song samples directly in the app

### **Technical Improvements**
- [ ] **Virtual Scrolling**: Handle 10,000+ files more efficiently
- [ ] **Background Processing**: Non-blocking metadata reading and lyric analysis
- [ ] **Database Integration**: SQLite for metadata caching and search indexing
- [ ] **Multi-threading**: Worker threads for file processing and lyric matching
- [ ] **Cloud Backup**: Integration with cloud storage services
- [ ] **Plugin System**: Extensible architecture for custom naming rules
- [ ] **Batch Job Queue**: Queue and schedule large renaming operations

### **UI/UX Enhancements**
- [ ] **Dark Mode**: Theme switching capability
- [ ] **Keyboard Shortcuts**: Power user navigation and rule management
- [ ] **Advanced Search**: Filter genres, files, metadata, lyrics content
- [ ] **Bulk Selection**: Select all/none/pattern-based genre and file selection
- [ ] **Progress Bars**: Detailed progress for large operations with ETA
- [ ] **Rule Templates**: Pre-built rule sets for common use cases
- [ ] **Visual Rule Builder**: Drag-and-drop interface for creating complex rules

## ⚠️ **Important Notes & Limitations**

### **Data Safety**
- **Always backup** your music collection before running bulk operations
- The app modifies original MP3 files AND renames them - changes are permanent
- Test with small datasets first before processing large collections  
- **Naming operations affect both metadata and filenames** - ensure templates are correct
- Use the preview functionality extensively before applying changes

### **File Format Support**
- Currently supports MP3 files only
- Requires valid ID3 tags (v2.3/v2.4 recommended) 
- NodeID3 dependency limits supported formats
- **Lyrics must be embedded in ID3 tags** for lyric search functionality
- Album art extraction requires embedded artwork in metadata

### **Performance Considerations**
- Processing thousands of files can take time, especially with lyric analysis
- Large genre collections (100+ unique) may slow UI slightly  
- **Lyric search operations are CPU-intensive** on large collections
- Memory usage scales with number of files loaded and lyrics content
- **Template processing and file renaming operations are I/O intensive**

### **Known Issues & Workarounds**  
- **Electron Focus Issue**: Alert dialogs can cause input focus problems - avoided in current version
- **Large Lyrics**: Very long lyrics content may slow search operations
- **Special Characters**: Template variables handle most Unicode, but filesystem limitations apply
- **File Permissions**: Ensure write permissions for both metadata updates and file renaming

### **Operating System Compatibility**
- Built with Electron - supports Windows, macOS, Linux
- File path handling uses Node.js path module for cross-platform compatibility
- Dialog boxes use native OS file picker

## 🔧 **Development Setup**

### **Required Dependencies**
```json
{
  "node-id3": "^0.2.3",        // MP3 metadata reading/writing
  "electron": "^39.2.7",       // Desktop app framework  
  "electron-forge": "^7.10.2"  // Build and packaging tools
}
```

### **Development Commands**
```bash
npm install              # Install dependencies
npm start               # Launch development version
npm run package         # Build executable
npm run make            # Create installer
node generate-test-data.js  # Create test MP3 files
```

### **Build Process**
- Uses Electron Forge for packaging
- Supports multiple output formats (ZIP, Squirrel, DMG, DEB, RPM)
- Auto-unpack natives plugin for node-id3 compatibility
- Fuses plugin for security hardening

---

**Last Updated**: December 2025  
**Version**: 2.0.0 - Major update with Naming via Lyrics functionality  
**Author**: Built for AI-generated music cleanup workflows and advanced metadata management