const NodeID3 = require('node-id3');
const fs = require('fs');
const path = require('path');

// Create a simple colored square image as album art (PNG format)
function createSimpleAlbumArt(color, size = 200) {
  // Create a simple PNG header and colored square
  // This is a minimal PNG - in real usage you'd use actual image files
  const canvas = Buffer.alloc(size * size * 4); // RGBA
  
  // Fill with color (simple solid color)
  const colors = {
    'blue': [0, 100, 200, 255],
    'red': [200, 50, 50, 255], 
    'green': [50, 150, 50, 255],
    'purple': [150, 50, 150, 255],
    'orange': [255, 150, 50, 255],
    'teal': [50, 150, 150, 255],
    'pink': [255, 100, 150, 255],
    'yellow': [255, 200, 50, 255],
    'gray': [100, 100, 100, 255],
    'cyan': [50, 200, 200, 255]
  };
  
  const colorValues = colors[color] || colors['gray'];
  
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = colorValues[0];     // R
    canvas[i + 1] = colorValues[1]; // G  
    canvas[i + 2] = colorValues[2]; // B
    canvas[i + 3] = colorValues[3]; // A
  }
  
  return canvas;
}

// Create a minimal MP3 file (just header, no actual audio)
// This creates a valid MP3 structure that NodeID3 can work with
function createMinimalMP3(filePath) {
  // MP3 frame header for a minimal valid MP3 file
  const mp3Header = Buffer.from([
    0xFF, 0xFB, 0x90, 0x00, // MP3 header
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  
  fs.writeFileSync(filePath, mp3Header);
}

// Test data with various genre combinations and album art
const testFiles = [
  {
    filename: "AI_Song_001.mp3",
    title: "Electric Dreams",
    artist: "AI Composer",
    album: "Generated Beats Vol.1",
    genre: "electronic; synthwave; ambient; dark; atmospheric;",
    lyrics: "Electric dreams in neon lights\nSynth waves flowing through the night\nDigital hearts beat in time\nWith melodies so sublime\n\nChorus:\nWe're living in electric dreams\nNothing is quite what it seems\nData streams and laser beams\nIn our electric dreams",
    albumArtColor: "blue"
  },
  {
    filename: "AI_Song_002.mp3", 
    title: "Urban Flow",
    artist: "Neural Networks",
    album: "Digital Soundscapes",
    genre: "rap; hip-hop; urban; dark; bass; emd;",
    lyrics: "Yeah, flowing through the urban maze\nNeural networks guide my ways\nDigital beats and bass so deep\nCity rhythms never sleep\n\nVerse 2:\nCode and rhymes intertwined\nArtificial but refined\nBeats drop heavy like the rain\nIn this urban digital domain",
    albumArtColor: "red"
  },
  {
    filename: "AI_Song_003.mp3",
    title: "Piano Reflections", 
    artist: "Deep Learning Orchestra",
    album: "Classical AI",
    genre: "classical; piano; emotional; cinematic; dark; orchestral;",
    lyrics: "Silent keys tell stories untold\nOf memories both new and old\nEach note a whisper in the wind\nWhere melodies and dreams begin\n\nBridge:\nIn the silence between the notes\nLives the music that truly floats\nClassical beauty, AI grace\nTogether in this sacred space",
    albumArtColor: "green"
  },
  {
    filename: "AI_Song_004.mp3",
    title: "Future Bass Drop",
    artist: "Algorithm Beats",
    album: "Bass Experiments", 
    genre: "future bass; electronic; emd; experimental; glitch; dark;",
    lyrics: "Future calling through the bass\nGlitches dancing in cyberspace\nExperimental sounds collide\nWhere algorithms and music hide\n\nDrop:\nBass drops heavy, future bright\nGlitch effects in colored light\nExperimental beats so clean\nIn this electronic dream machine",
    albumArtColor: "purple"
  },
  {
    filename: "AI_Song_005.mp3",
    title: "Chill Vibes",
    artist: "ML Collective",
    album: "Relaxation Station",
    genre: "chillout; ambient; lofi; piano; jazz; smooth;",
    lyrics: "Chill vibes floating in the air\nLofi beats beyond compare\nJazz piano soft and smooth\nHelps the soul get in the groove\n\nOutro:\nAmbient sounds that calm the mind\nLeave the stress of day behind\nChill out vibes, so pure and true\nThis song's a gift from me to you",
    albumArtColor: "orange"
  },
  {
    filename: "AI_Song_006.mp3",
    title: "Rock Revolution",
    artist: "Digital Guitars",  
    album: "AI Rock Chronicles",
    genre: "rock; alternative; guitar; energetic; modern; dark; heavy;",
    lyrics: "Revolution in the making\nGuitar strings are awakening\nAlternative rock so loud\nRising above the digital crowd\n\nChorus:\nWe are the rock revolution\nBreaking through with resolution\nHeavy riffs and modern sound\nWhere digital meets rock and roll ground",
    albumArtColor: "teal"
  },
  {
    filename: "AI_Song_007.mp3",
    title: "Techno Sunrise",
    artist: "Binary Beats",
    album: "Morning Algorithms", 
    genre: "techno; electronic; dance; upbeat; emd; synthetic;",
    lyrics: "Sunrise breaking through the screen\nTechno beats, the morning scene\nDance floor pulsing with the light\nElectronic dreams take flight\n\nBuild up:\nSynthetic sounds that make us move\nBinary rhythms in the groove\nUpbeat tempo, energy high\nTechno sunrise fills the sky",
    albumArtColor: "pink"
  },
  {
    filename: "AI_Song_008.mp3",
    title: "Jazz Fusion Experiment",
    artist: "Neural Jazz Ensemble", 
    album: "Computational Jazz",
    genre: "jazz; fusion; experimental; piano; bass; sophisticated;",
    lyrics: "Jazz fusion in the digital age\nExperimental sounds upon the stage\nPiano keys and bass lines deep\nSophisticated rhythms that we keep\n\nSolo section:\nImprovisation meets the code\nWhere jazz tradition finds new mode\nFusion of the old and new\nComputational jazz, pure and true",
    albumArtColor: "yellow"
  },
  {
    filename: "AI_Song_009.mp3",
    title: "Emotional Strings",
    artist: "String Theory AI",
    album: "Orchestrated Emotions",
    genre: "orchestral; strings; emotional; cinematic; epic; dark; dramatic;",
    lyrics: "Strings that pull upon the heart\nEmotional tales, a work of art\nOrchestrated dreams so grand\nCinematic visions across the land\n\nClimax:\nEpic moments rise and fall\nDramatic strings that call to all\nEmotional depths we've never known\nIn this orchestral AI home",
    albumArtColor: "gray"
  },
  {
    filename: "AI_Song_010.mp3", 
    title: "Minimal Beats",
    artist: "Less Is More AI",
    album: "Minimalist Collection",
    genre: "minimal; techno; electronic; repetitive; emd; hypnotic;",
    lyrics: "Less is more in every beat\nMinimal sounds so pure and sweet\nRepetitive rhythms hypnotize\nElectronic dreams before our eyes\n\nLoop:\nHypnotic patterns, simple and clean\nThe most minimal you've ever seen\nTechno pulses, steady flow\nWhere less becomes the way to go",
    albumArtColor: "cyan"
  }
];


async function generateTestData() {
  try {
    // Create test-data directory
    const testDir = path.join(__dirname, 'test-data');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }

    console.log('Generating test MP3 files with genre metadata...\n');

    for (const fileData of testFiles) {
      const filePath = path.join(testDir, fileData.filename);
      
      // Create minimal MP3 file
      createMinimalMP3(filePath);
      
      // Prepare tags with album art
      const tags = {
        title: fileData.title,
        artist: fileData.artist,
        album: fileData.album,
        genre: fileData.genre,
        year: "2024",
        unsynchronisedLyrics: {
          language: "eng",
          text: fileData.lyrics
        }
      };
      
      // Add album art if specified
      if (fileData.albumArtColor) {
        const imageBuffer = createSimpleAlbumArt(fileData.albumArtColor);
        tags.image = {
          mime: "image/png",
          type: {
            id: 3,
            name: "front cover"
          },
          description: "Album Cover",
          imageBuffer: imageBuffer
        };
      }

      // Write ID3 tags
      const success = NodeID3.write(tags, filePath);
      
      if (success) {
        console.log(`✓ Created: ${fileData.filename}`);
        console.log(`  Title: ${fileData.title}`);
        console.log(`  Artist: ${fileData.artist}`);
        console.log(`  Genre: ${fileData.genre}`);
        console.log('');
      } else {
        console.error(`✗ Failed to create: ${fileData.filename}`);
      }
    }

    console.log(`\n🎵 Generated ${testFiles.length} test MP3 files in: ${testDir}`);
    console.log('\nGenres included in test data:');
    
    // Extract and display all unique genres
    const allGenres = new Set();
    testFiles.forEach(file => {
      const genres = file.genre.split('; ').map(g => g.trim()).filter(g => g);
      genres.forEach(genre => allGenres.add(genre));
    });
    
    const sortedGenres = Array.from(allGenres).sort();
    console.log(sortedGenres.map(g => `  • ${g}`).join('\n'));
    
    console.log('\n💡 Suggested genres to test removing: dark, emd, experimental');
    console.log('\n🚀 Now you can test your MP3 Genre Cleaner with this test data!');
    
  } catch (error) {
    console.error('Error generating test data:', error);
  }
}

// Run the generator
generateTestData();