# MP3 Genre Cleaner & Advanced Metadata Manager

## 📋 **Overview**

The MP3 Genre Cleaner is an advanced Electron application designed to clean up AI-generated music metadata, provide sophisticated file renaming capabilities based on lyric content, and automatically scrape missing lyrics and genres from Suno.com URLs. The app features a comprehensive tabbed interface with four main functions: metadata viewing, genre cleaning, intelligent file renaming using lyric search patterns, and automated web scraping for missing metadata.

## 🎯 **Primary Use Cases**

### **1. Genre Cleanup**
This application was built to solve the problem of AI-generated music having messy genre strings like:
- `"rap; dark; emd; piano; atmospheric; electronic;"`
- `"jazz; experimental; dark; glitch; ambient;"`

Users can bulk-select unwanted genres and remove them from entire music collections while preserving good genre tags.

### **2. Intelligent File Renaming**
Advanced template-based file renaming system that searches song lyrics for specific text patterns and applies custom naming templates. Perfect for organizing large music collections by lyrical content, themes, or organizing compilation albums.

**NEW: Enhanced Multi-Search Support** - Each rule now supports multiple lyric search strings, allowing songs with slight lyrical variations to be captured under the same rule while maintaining consistent numbering within that rule.

### **3. Automated Metadata Scraping**
**NEW: Web Scraping Integration** - Automatically extract missing lyrics and genres directly from Suno.com URLs stored in MP3 metadata. Uses browser automation to respectfully gather data while maintaining server courtesy with built-in delays and smart processing.

## 🏗️ **Application Architecture**

### **Technology Stack**
- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js with Electron
- **MP3 Metadata**: NodeID3 library
- **Web Scraping**: Puppeteer for browser automation
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
3. **Tabbed Interface**: Four main functional areas with visual toggle controls

### **Tab 1: 📋 View Metadata**
- **Purpose**: Browse and review all MP3 files and their metadata
- **Features**:
  - Scrollable table with comprehensive file information
  - **Column Visibility Controls**: Eye icon toggles (👁️/🙈) for each column
  - **Sortable Columns**: Click headers to sort by Title or Album
  - **Expandable Lyrics**: Click "Show" to view full song lyrics
  - **Album Art Display**: Clickable thumbnails with modal view
  - **NEW: Scraper Integration**: "🔍 Get Lyrics" buttons for files missing lyrics (auto-switches to scraper tab)
  - **Real-time Status**: Buttons show "In process, please wait..." during active scraping
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
  - **Multiple Lyric Search Rules**: Define multiple text patterns to search for within a single rule
  - **Template System**: Custom naming templates with variable substitution
  - **Rule Management**: Add, remove, expand/collapse rule configurations
  - **Smart Conflict Resolution**: Automatically finds next available number in sequence for filename conflicts
  - **Save/Load Rules**: Export and import rule sets as JSON files with backward compatibility
  - **Preview Changes**: See exactly what files will be renamed before applying
  - **Batch Processing**: Apply all rules and rename multiple files at once
  - **Enhanced UI**: Rules stay expanded during editing, with real-time preview updates

### **Tab 4: 🔍 Get lyrics and Genres**
- **Purpose**: Automatically scrape missing lyrics and genres from Suno.com URLs
- **Features**:
  - **Automated Web Scraping**: Uses Puppeteer to extract data from Suno.com pages
  - **Smart File Processing**: Only processes files that actually need lyrics/genres
  - **Real-time Logging**: Live progress updates with detailed success/error reporting  
  - **Server Courtesy**: Built-in delays (2-5 seconds) and memory management every 100 files
  - **Progress Tracking**: Visual statistics showing successful, failed, and skipped files
  - **Auto-refresh Integration**: Automatically updates metadata view after completion
  - **Comprehensive Help**: Detailed usage guidelines and best practices
  - **Stop/Start Controls**: Full control over scraping process with graceful stopping

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
- **Scraper Integration**: Dynamic "🔍 Get Lyrics" buttons for files missing lyrics
- **Real-time Updates**: Button states update during scraping operations
- **Sorting Capabilities**: Multi-column sorting with visual indicators
- **Responsive Layout**: Adapts to different screen sizes and column configurations

### **3. Automated Web Scraping System**
- **URL Detection**: Automatically finds Suno.com URLs in MP3 metadata (`audioSourceUrl` field)
- **Browser Automation**: Uses Puppeteer to launch Chrome and navigate to Suno pages
- **Data Extraction**: Locates and extracts lyrics and genre information from page elements
- **Metadata Integration**: Updates MP3 files with scraped lyrics and genres using NodeID3
- **Smart Processing**: Skips files that already have complete lyrics and genres
- **Server Courtesy**: Implements 2-5 second random delays between requests
- **Memory Management**: Restarts browser every 100 files to prevent memory issues
- **Error Handling**: Graceful failure handling with detailed logging
- **Progress Tracking**: Real-time statistics and file processing updates
- **Auto-refresh**: Automatically updates metadata view after successful completion

### **4. Genre Processing Logic**
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

### **6. Enhanced Lyric Search & Template Engine**
The application features a sophisticated file renaming system based on lyric content analysis with advanced multi-search capabilities:

#### **Multiple Search Patterns per Rule**
- **Multi-Search Support**: Each rule can contain multiple lyric search strings
- **OR Logic**: Songs matching ANY of the search patterns within a rule are processed
- **Consistent Numbering**: All matches within a rule maintain sequential numbering
- **Case-Insensitive Matching**: Flexible text matching regardless of capitalization
- **Rule Priority**: Rules are processed in order, first match wins

#### **Use Case Example**
```javascript
Rule #1: Love Songs Compilation
Lyric Searches: 
  - "I love you"
  - "you are my everything" 
  - "forever and always"
  
// All songs with any of these lyrics get numbered 001, 002, 003... 
// under the same rule, maintaining consistency
```

#### **Smart Conflict Resolution**
- **Automatic Sequence Detection**: Scans existing files to find used numbers
- **Next Available Assignment**: Automatically assigns next number in sequence
- **No Ugly Suffixes**: Maintains clean numbering (087, 088, 089) instead of (1), (2), (3)
- **Prevents Overwrites**: Safe handling of existing filenames

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
- **Enhanced UI Experience**: Rules stay expanded during editing operations
- **Real-time Preview Updates**: Lyric search preview text updates as you type
- **Multi-Search Interface**: Add/remove individual search strings within rules
- **JSON Export/Import**: Save rule sets to `.json` files for reuse across projects
- **Backward Compatibility**: Seamlessly loads old single-search rule files
- **Rule Preview**: See exactly which files match before applying changes
- **Batch Operations**: Apply all rules simultaneously with comprehensive preview
- **Error Handling**: Graceful failure with detailed error reporting

#### **Enhanced JSON Rule Format**
```json
{
  "version": "2.0",
  "timestamp": "2025-12-21T10:30:00.000Z",
  "rulesCount": 2,
  "rules": [
    {
      "id": 1,
      "lyricSearches": [
        "I'd rather be the engine",
        "driving down the highway",
        "road trip anthem"
      ],
      "albumTemplate": "Driving Songs Collection",
      "songTemplate": "{title} - {artist}",
      "artistTemplate": "Various Artists", 
      "filenameTemplate": "{number:03d} - {artist} - {title}",
      "startNumber": 1
    }
  ]
}
  "rulesCount": 2,
  "rules": [
    {
      "id": 1,
      "lyricSearches": [
        "I'd rather be the engine",
        "driving down the highway",
        "road trip anthem"
      ],
      "albumTemplate": "Driving Songs Collection",
      "songTemplate": "{title} - {artist}",
      "artistTemplate": "Various Artists", 
      "filenameTemplate": "{number:03d} - {artist} - {title}",
      "startNumber": 1
    }
  ]
}
```

### **8. Enhanced Naming Process Flow**
1. **Rule Creation**: Define multiple lyric search texts and naming templates per rule
2. **Multi-Search Matching**: Songs matching ANY search string in a rule are processed together
3. **Smart Conflict Resolution**: System automatically finds next available number in sequence
4. **Preview Generation**: See which files match and preview new names with conflict resolution
5. **Batch Application**: Apply all rules with atomic file operations and intelligent numbering
6. **Metadata Updates**: Update ID3 tags with new artist, title, album information
7. **File Renaming**: Rename physical files with automatic conflict resolution
8. **Data Refresh**: Reload all metadata to reflect changes

#### **Conflict Resolution Examples**
```javascript
// Existing files: 001-085 are already used
// New song matches rule → automatically gets 086

// Later, another matching song → automatically gets 087
// No manual tracking needed!

// Works great for:
// - Re-running rules after changes
// - Adding new songs with similar lyrics  
// - Organizing compilation albums
```

## 📊 **Performance Optimizations**

### **Large Dataset Handling**
- **Scrollable Tables**: Handles thousands of files efficiently
- **Sticky Headers**: Maintains context while scrolling
- **Grid Layout**: Auto-adjusting genre checkboxes
- **Memory Management**: Efficient DOM updates and rendering
- **Responsive Design**: Works on various screen sizes

### **User Experience**
- **Progress Indicators**: Loading states during operations
- **Real-time Feedback**: Statistics update as selections change, lyric previews update as you type
- **Visual Feedback**: Hover effects, button states, highlighting
- **Enhanced UI Stability**: Custom alert system prevents Electron input focus issues
- **Persistent UI State**: Rules stay expanded during editing operations
- **Error Handling**: Graceful failure with user-friendly custom modals

## 🔌 **IPC Communication**

### **Main Process → Renderer**
- `select-folder`: Opens folder dialog, returns selected path
- `read-mp3-metadata`: Reads all MP3 files in folder, returns comprehensive metadata array
- `update-mp3-genres`: Updates genre tags in MP3 files, returns success/failure results
- `preview-naming-changes`: Analyzes files against lyric rules, returns preview of changes
- `apply-naming-changes`: Executes file renaming and metadata updates based on rules
- `save-naming-rules`: Exports naming rules to JSON file with dialog
- `load-naming-rules`: Imports naming rules from JSON file with dialog
- `start-scraping`: Initiates web scraping process for missing lyrics/genres
- `stop-scraping`: Gracefully stops the active scraping process

### **Renderer → Main Process (Events)**
- `scraping-log`: Real-time log messages during scraping operations
- `scraping-progress`: Progress updates with statistics and completion status

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

// Enhanced Naming Rule Object
{
  id: 1,
  lyricSearches: ["specific lyrics to find", "alternative lyrics", "another variation"],
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

## 🚀 **Recent Enhancements (v3.0 - Scraper Integration)**

### **✅ NEW: Complete Web Scraping System**
- **Automated Metadata Extraction**: Full Puppeteer integration for Suno.com scraping
- **Smart Lyrics Buttons**: Dynamic "🔍 Get Lyrics" buttons in metadata view for missing lyrics
- **Real-time Progress Tracking**: Live logging and statistics during scraping operations
- **Server Courtesy Features**: Built-in delays, memory management, and best practices guidance
- **Auto-refresh Integration**: Metadata view updates automatically after scraping completion
- **Comprehensive Help System**: Detailed usage guidelines and courtesy recommendations

### **✅ Previous Features (v2.1)**
- **Multiple Lyric Search Strings**: Each rule now supports multiple search patterns
- **Smart Filename Conflict Resolution**: Automatic sequence detection and numbering
- **Enhanced UI Experience**: Rules stay expanded, real-time preview updates
- **Custom Alert System**: Prevents Electron input focus issues
- **Backward Compatibility**: Seamless loading of old single-search rule files
- **Improved Error Handling**: User-friendly custom modal dialogs

### **Future Enhancement Areas**

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
- **Lyrics Content Requirements**: **Lyrics must be embedded in ID3 tags** for search functionality to work
- **Template Processing**: Complex template patterns may require testing with preview function first
- **Large Collections**: **Multi-search operations are CPU-intensive** on very large collections (5000+ files)
- **Special Characters**: Template variables handle most Unicode, but filesystem limitations apply
- **File Permissions**: Ensure write permissions for both metadata updates and file renaming

### **Recent Fixes**
- ✅ **Fixed**: Electron input focus issues (replaced native alerts with custom modals)
- ✅ **Fixed**: Rules collapsing when adding lyric searches (persistent expansion state)
- ✅ **Fixed**: Preview text not updating for new rules (enhanced refresh system)
- ✅ **Fixed**: Filename conflicts causing rename failures (smart sequence detection)

### **Operating System Compatibility**
- Built with Electron - supports Windows, macOS, Linux
- File path handling uses Node.js path module for cross-platform compatibility
- Dialog boxes use native OS file picker

## 🔧 **Development Setup**

### **Required Dependencies**
```json
{
  "node-id3": "^0.2.3",        // MP3 metadata reading/writing
  "puppeteer": "^21.5.2",      // Web scraping and browser automation
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

**Last Updated**: December 22, 2025  
**Version**: 3.0.0 - Complete Web Scraping Integration  
**Author**: Built for AI-generated music cleanup workflows and advanced metadata management

### **Version History**
- **v3.0.0** (Dec 22, 2025): Full web scraping integration with Puppeteer, automated Suno.com lyrics/genre extraction, smart UI integration
- **v2.1.0** (Dec 21, 2025): Multiple lyric searches per rule, smart filename conflict resolution, enhanced UI stability
- **v2.0.0** (Dec 2025): Major update with Naming via Lyrics functionality  
- **v1.0.0** (Initial): Core MP3 metadata reading and genre cleaning functionality  
- **v1.0.0** (Initial): Core MP3 metadata reading and genre cleaning functionality