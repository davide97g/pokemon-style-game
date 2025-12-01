/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
}

const game = new Phaser.Game(config)
let cursors
let player
let showDebug = false
let weatherWidget = null
let weatherData = null

// Menu and Dialog state
const MENU_ENTRIES = [
  'Pokédex',
  'Pokémon',
  'Bag',
  'Pokégear',
  'Red',
  'Save',
  'Options',
  'Debug',
  'Exit'
]
let isMenuOpen = false
let selectedMenuIndex = 0
let menuContainer = null
let menuTexts = []
let dialogContainer = null
let dialogText = null
let dialogIndicator = null
let isDialogVisible = false
let dialogLines = []
let currentDialogLineIndex = 0
let currentDialogCharIndex = 0
let dialogTypingTimer = null
let dialogScene = null

function preload() {
  this.load.image('tiles', '../assets/tilesets/tuxmon-sample-32px-extruded.png')
  this.load.tilemapTiledJSON('map', '../assets/tilemaps/tuxemon-town-expanded.json')

  // An atlas is a way to pack multiple images together into one texture. I'm using it to load all
  // the player animations (walking left, walking right, etc.) in one image. For more info see:
  //  https://labs.phaser.io/view.html?src=src/animation/texture%20atlas%20animation.js
  // If you don't use an atlas, you can do the same thing with a spritesheet, see:
  //  https://labs.phaser.io/view.html?src=src/animation/single%20sprite%20sheet.js
  this.load.atlas(
    'atlas',
    '../assets/atlas/atlas.png',
    '../assets/atlas/atlas.json'
  )
}

function create() {
  const map = this.make.tilemap({ key: 'map' })

  // Parameters are the name you gave the tileset in Tiled and then the key of the tileset image in
  // Phaser's cache (i.e. the name you used in preload)
  const tileset = map.addTilesetImage('tuxmon-sample-32px-extruded', 'tiles')

  // Parameters: layer name (or index) from Tiled, tileset, x, y
  const belowLayer = map.createLayer('Below Player', tileset, 0, 0)
  const worldLayer = map.createLayer('World', tileset, 0, 0)
  const aboveLayer = map.createLayer('Above Player', tileset, 0, 0)

  worldLayer.setCollisionByProperty({ collides: true })

  // By default, everything gets depth sorted on the screen in the order we created things. Here, we
  // want the "Above Player" layer to sit on top of the player, so we explicitly give it a depth.
  // Higher depths will sit on top of lower depth objects.
  aboveLayer.setDepth(10)

  // Object layers in Tiled let you embed extra info into a map - like a spawn point or custom
  // collision shapes. In the tmx file, there's an object layer with a point named "Spawn Point"
  const spawnPoint = map.findObject(
    'Objects',
    (obj) => obj.name === 'Spawn Point'
  )

  // Create a sprite with physics enabled via the physics system. The image used for the sprite has
  // a bit of whitespace, so I'm using setSize & setOffset to control the size of the player's body.
  player = this.physics.add
    .sprite(spawnPoint.x, spawnPoint.y, 'atlas', 'misa-front')
    .setSize(30, 40)
    .setOffset(0, 24)

  // Watch the player and worldLayer for collisions, for the duration of the scene:
  this.physics.add.collider(player, worldLayer)

  // Create the player's walking animations from the texture atlas. These are stored in the global
  // animation manager so any sprite can access them.
  const anims = this.anims
  anims.create({
    key: 'misa-left-walk',
    frames: anims.generateFrameNames('atlas', {
      prefix: 'misa-left-walk.',
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  })
  anims.create({
    key: 'misa-right-walk',
    frames: anims.generateFrameNames('atlas', {
      prefix: 'misa-right-walk.',
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  })
  anims.create({
    key: 'misa-front-walk',
    frames: anims.generateFrameNames('atlas', {
      prefix: 'misa-front-walk.',
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  })
  anims.create({
    key: 'misa-back-walk',
    frames: anims.generateFrameNames('atlas', {
      prefix: 'misa-back-walk.',
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  })

  const camera = this.cameras.main
  camera.startFollow(player)
  camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

  cursors = this.input.keyboard.createCursorKeys()

  // Initialize menu and dialog
  initMenu.call(this)
  initDialog.call(this)

  // Initialize weather widget
  initWeatherWidget.call(this)

  // Debug graphics
  this.input.keyboard.once('keydown-D', (event) => {
    // Turn on physics debugging to show player's hitbox
    this.physics.world.createDebugGraphic()

    // Create worldLayer collision graphic above the player, but below the help text
    const graphics = this.add.graphics().setAlpha(0.75).setDepth(20)
    worldLayer.renderDebug(graphics, {
      tileColor: null, // Color of non-colliding tiles
      collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), // Color of colliding tiles
      faceColor: new Phaser.Display.Color(40, 39, 37, 255) // Color of colliding face edges
    })
  })
}

function update(time, delta) {
  // Don't update player movement if menu or dialog is open
  if (isMenuOpen || isDialogVisible) {
    player.body.setVelocity(0)
    player.anims.stop()
    return
  }

  const speed = 175
  const prevVelocity = player.body.velocity.clone()

  // Stop any previous movement from the last frame
  player.body.setVelocity(0)

  // Horizontal movement
  if (cursors.left.isDown) {
    player.body.setVelocityX(-speed)
  } else if (cursors.right.isDown) {
    player.body.setVelocityX(speed)
  }

  // Vertical movement
  if (cursors.up.isDown) {
    player.body.setVelocityY(-speed)
  } else if (cursors.down.isDown) {
    player.body.setVelocityY(speed)
  }

  // Normalize and scale the velocity so that player can't move faster along a diagonal
  player.body.velocity.normalize().scale(speed)

  // Update the animation last and give left/right animations precedence over up/down animations
  if (cursors.left.isDown) {
    player.anims.play('misa-left-walk', true)
  } else if (cursors.right.isDown) {
    player.anims.play('misa-right-walk', true)
  } else if (cursors.up.isDown) {
    player.anims.play('misa-back-walk', true)
  } else if (cursors.down.isDown) {
    player.anims.play('misa-front-walk', true)
  } else {
    player.anims.stop()

    // If we were moving, pick and idle frame to use
    if (prevVelocity.x < 0) player.setTexture('atlas', 'misa-left')
    else if (prevVelocity.x > 0) player.setTexture('atlas', 'misa-right')
    else if (prevVelocity.y < 0) player.setTexture('atlas', 'misa-back')
    else if (prevVelocity.y > 0) player.setTexture('atlas', 'misa-front')
  }
}

// Weather widget functions
const WEATHER_CODE_MAP = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
}

const getWeatherIcon = (weathercode) => {
  if (weathercode === 0) return '☀️'
  if (weathercode <= 3) return '⛅'
  if (weathercode <= 48) return '🌫️'
  if (weathercode <= 67) return '🌧️'
  if (weathercode <= 86) return '❄️'
  return '⛈️'
}

const formatTime = (timeString) => {
  const date = new Date(timeString)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const fetchWeatherData = async (lat, lon) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=sunrise,sunset&timezone=auto`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error('Failed to fetch weather data')
    }

    const data = await response.json()
    return {
      ...data.current_weather,
      daily: data.daily
    }
  } catch (error) {
    console.error('Error fetching weather:', error)
    return null
  }
}

const initWeatherWidget = function () {
  // Get user location
  if (!navigator.geolocation) {
    createWeatherWidget.call(this, null, 'Geolocation not supported')
    return
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude
      const lon = position.coords.longitude
      const weather = await fetchWeatherData(lat, lon)
      createWeatherWidget.call(this, weather, null)
    },
    (err) => {
      let errorMessage = 'Unable to get location'
      if (err.code === 1) {
        errorMessage = 'Location access denied'
      } else if (err.code === 2) {
        errorMessage = 'Location unavailable'
      } else if (err.code === 3) {
        errorMessage = 'Location request timed out'
      }
      createWeatherWidget.call(this, null, errorMessage)
    }
  )
}

const createWeatherWidget = function (weather, error) {
  const width = this.cameras.main.width
  const padding = 16
  const widgetWidth = 280
  const widgetHeight = 140
  const x = width - widgetWidth - padding
  const y = padding

  // Create container for the widget
  const container = this.add.container(x, y)
  container.setScrollFactor(0)
  container.setDepth(30)

  // Create background
  const bg = this.add.rectangle(
    widgetWidth / 2,
    widgetHeight / 2,
    widgetWidth,
    widgetHeight,
    0xffffff,
    0.9
  )
  bg.setStrokeStyle(2, 0x000000, 0.3)
  container.add(bg)

  if (error || !weather) {
    // Error state
    const errorText = this.add.text(widgetWidth / 2, widgetHeight / 2, error || 'Unable to fetch weather', {
      font: '14px monospace',
      fill: '#ff0000',
      align: 'center',
      wordWrap: { width: widgetWidth - 20 }
    })
    errorText.setOrigin(0.5)
    container.add(errorText)
    weatherWidget = container
    return
  }

  const weatherDescription = WEATHER_CODE_MAP[weather.weathercode] || 'Unknown'
  const weatherIcon = getWeatherIcon(weather.weathercode)

  // Weather icon and main info
  const iconText = this.add.text(20, 20, weatherIcon, {
    font: '32px monospace',
    fill: '#000000'
  })
  container.add(iconText)

  const tempText = this.add.text(60, 15, `${weather.temperature.toFixed(1)}°C`, {
    font: 'bold 20px monospace',
    fill: '#000000'
  })
  container.add(tempText)

  const descText = this.add.text(60, 40, weatherDescription, {
    font: '12px monospace',
    fill: '#333333',
    wordWrap: { width: widgetWidth - 80 }
  })
  container.add(descText)

  // Additional info
  const windText = this.add.text(20, 80, `Wind: ${weather.windspeed.toFixed(1)} km/h`, {
    font: '12px monospace',
    fill: '#666666'
  })
  container.add(windText)

  const timeText = this.add.text(20, 100, `Updated: ${formatTime(weather.time)}`, {
    font: '11px monospace',
    fill: '#666666'
  })
  container.add(timeText)

  weatherWidget = container
  weatherData = weather

  // Update weather every 5 minutes
  setInterval(async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude
          const lon = position.coords.longitude
          const newWeather = await fetchWeatherData(lat, lon)
          if (newWeather && weatherWidget) {
            updateWeatherWidget.call(this, newWeather)
          }
        },
        () => {
          // Silently fail on update
        }
      )
    }
  }, 5 * 60 * 1000) // 5 minutes
}

const updateWeatherWidget = function (weather) {
  if (!weatherWidget || !weather) return

  weatherData = weather
  const weatherDescription = WEATHER_CODE_MAP[weather.weathercode] || 'Unknown'
  const weatherIcon = getWeatherIcon(weather.weathercode)

  // Clear existing text elements (keep background)
  const children = weatherWidget.list.slice(1) // Skip background
  children.forEach((child) => {
    if (child.type === 'Text') {
      child.destroy()
    }
  })

  // Recreate text elements with relative positioning
  const iconText = this.add.text(20, 20, weatherIcon, {
    font: '32px monospace',
    fill: '#000000'
  })
  weatherWidget.add(iconText)

  const tempText = this.add.text(60, 15, `${weather.temperature.toFixed(1)}°C`, {
    font: 'bold 20px monospace',
    fill: '#000000'
  })
  weatherWidget.add(tempText)

  const descText = this.add.text(60, 40, weatherDescription, {
    font: '12px monospace',
    fill: '#333333',
    wordWrap: { width: 200 }
  })
  weatherWidget.add(descText)

  const windText = this.add.text(20, 80, `Wind: ${weather.windspeed.toFixed(1)} km/h`, {
    font: '12px monospace',
    fill: '#666666'
  })
  weatherWidget.add(windText)

  const timeText = this.add.text(20, 100, `Updated: ${formatTime(weather.time)}`, {
    font: '11px monospace',
    fill: '#666666'
  })
  weatherWidget.add(timeText)
}

// Menu functions
const initMenu = function () {
  const width = this.cameras.main.width
  const height = this.cameras.main.height
  const menuWidth = 192
  const menuX = width - menuWidth - 16
  const menuY = 16

  // Create container for menu
  menuContainer = this.add.container(menuX, menuY)
  menuContainer.setScrollFactor(0)
  menuContainer.setDepth(50)
  menuContainer.setVisible(false)

  // Create background
  const bg = this.add.rectangle(
    menuWidth / 2,
    0,
    menuWidth,
    height - 32,
    0xcccccc,
    0.85
  )
  bg.setStrokeStyle(2, 0x808080)
  menuContainer.add(bg)

  // Create menu entries
  menuTexts = []
  const entryHeight = 24
  const padding = 12
  const startY = padding

  MENU_ENTRIES.forEach((entry, index) => {
    const y = startY + index * entryHeight
    const entryText = this.add.text(padding, y, entry, {
      font: '16px monospace',
      fill: '#ffffff',
      align: 'left'
    })
    entryText.setOrigin(0, 0)
    entryText.setPadding(4, 4, 4, 4)
    menuContainer.add(entryText)
    menuTexts.push(entryText)
  })

  // Setup keyboard handlers
  const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
  const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)

  // Spacebar to toggle menu or advance dialog
  spaceKey.on('down', () => {
    if (isDialogVisible) {
      // Advance dialog (same as Enter)
      handleDialogAdvance.call(this)
    } else {
      // Toggle menu
      toggleMenu.call(this)
    }
  })

  // Arrow keys for menu navigation
  this.input.keyboard.on('keydown-UP', () => {
    if (isMenuOpen && !isDialogVisible) {
      selectedMenuIndex = selectedMenuIndex > 0 ? selectedMenuIndex - 1 : MENU_ENTRIES.length - 1
      updateMenuSelection.call(this)
    }
  })

  this.input.keyboard.on('keydown-DOWN', () => {
    if (isMenuOpen && !isDialogVisible) {
      selectedMenuIndex = selectedMenuIndex < MENU_ENTRIES.length - 1 ? selectedMenuIndex + 1 : 0
      updateMenuSelection.call(this)
    }
  })

  // Enter to select menu entry or advance dialog
  enterKey.on('down', () => {
    if (isDialogVisible) {
      handleDialogAdvance.call(this)
    } else if (isMenuOpen) {
      const selectedEntry = MENU_ENTRIES[selectedMenuIndex]
      handleMenuSelect.call(this, selectedEntry)
    }
  })
}

const toggleMenu = function () {
  isMenuOpen = !isMenuOpen
  menuContainer.setVisible(isMenuOpen)
  
  if (isMenuOpen) {
    selectedMenuIndex = 0
    updateMenuSelection.call(this)
  }
}

const updateMenuSelection = function () {
  menuTexts.forEach((text, index) => {
    const entryName = MENU_ENTRIES[index]
    if (index === selectedMenuIndex) {
      text.setFill('#ffffff')
      text.setBackgroundColor('#666666')
      // Add arrow indicator
      if (!text.text.startsWith('►')) {
        text.setText('► ' + entryName)
      }
    } else {
      text.setFill('#ffffff')
      text.setBackgroundColor(null)
      // Remove arrow indicator
      if (text.text.startsWith('►')) {
        text.setText(entryName)
      }
    }
  })
}

const handleMenuSelect = function (entry) {
  isMenuOpen = false
  menuContainer.setVisible(false)

  const dialogTexts = {
    'Pokédex': 'The Pokédex is a high-tech encyclopedia that records data on Pokémon. It automatically records data on any Pokémon you encounter or catch.',
    'Pokémon': 'You have no Pokémon with you right now.',
    'Bag': 'Your bag is empty. You should collect some items during your journey.',
    'Pokégear': 'The Pokégear is a useful device that shows the time and map. It also allows you to make calls to other trainers.',
    'Red': 'This is your trainer card. It shows your name, badges, and other important information about your journey.',
    'Save': 'Would you like to save your progress? Your game will be saved to the current slot.',
    'Options': 'Adjust game settings here. You can change the text speed, sound volume, and other preferences.',
    'Debug': 'Debug mode activated. This mode shows additional information for developers.',
    'Exit': 'Are you sure you want to exit? Any unsaved progress will be lost.'
  }

  const speaker = entry === 'Red' ? undefined : entry
  showDialog.call(this, dialogTexts[entry] || `${entry} selected.`, speaker)
}

// Dialog functions
const initDialog = function () {
  dialogScene = this
  const width = this.cameras.main.width
  const height = this.cameras.main.height
  const dialogWidth = width - 64
  const dialogHeight = 100
  const dialogX = 32
  const dialogY = height - dialogHeight - 32

  // Create container for dialog
  dialogContainer = this.add.container(dialogX, dialogY)
  dialogContainer.setScrollFactor(0)
  dialogContainer.setDepth(50)
  dialogContainer.setVisible(false)

  // Create background (light blue with darker blue border)
  const bg = this.add.rectangle(
    dialogWidth / 2,
    dialogHeight / 2,
    dialogWidth,
    dialogHeight,
    0xadd8e6,
    1
  )
  bg.setStrokeStyle(4, 0x4169e1)
  dialogContainer.add(bg)

  // Create dialog text
  dialogText = this.add.text(16, 16, '', {
    font: '16px monospace',
    fill: '#000000',
    align: 'left',
    wordWrap: { width: dialogWidth - 80 }
  })
  dialogText.setOrigin(0, 0)
  dialogContainer.add(dialogText)

  // Create "->" indicator with jumping animation
  dialogIndicator = this.add.text(dialogWidth - 40, dialogHeight - 30, '->', {
    font: '20px monospace',
    fill: '#000000',
    align: 'right'
  })
  dialogIndicator.setOrigin(0.5, 0.5)
  dialogIndicator.setVisible(false)
  dialogContainer.add(dialogIndicator)
}

const splitTextIntoLines = function (text, maxWidth) {
  // Use Phaser's text measurement for accurate wrapping
  const tempText = dialogScene.add.text(0, 0, '', {
    font: '16px monospace',
    fill: '#000000'
  })
  tempText.setVisible(false)
  
  const words = text.split(' ')
  const lines = []
  let currentLine = ''

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    tempText.setText(testLine)
    const textWidth = tempText.width

    if (textWidth > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  tempText.destroy()
  return lines
}

const showDialog = function (text, speaker) {
  // Clear any existing typing timer
  if (dialogTypingTimer) {
    clearTimeout(dialogTypingTimer)
    dialogTypingTimer = null
  }

  isDialogVisible = true
  const fullText = speaker ? `${speaker}: ${text}` : text
  
  // Split text into lines based on dialog width
  const dialogWidth = dialogScene.cameras.main.width - 64
  const maxTextWidth = dialogWidth - 80
  dialogLines = splitTextIntoLines(fullText, maxTextWidth)
  
  currentDialogLineIndex = 0
  currentDialogCharIndex = 0
  dialogText.setText('')
  dialogIndicator.setVisible(false)
  dialogContainer.setVisible(true)

  // Start typing animation
  typeDialogText.call(dialogScene)
  
  // Stop any existing indicator animation
  dialogScene.tweens.killTweensOf(dialogIndicator)
}

const typeDialogText = function () {
  if (currentDialogLineIndex >= dialogLines.length) {
    // All lines shown, hide indicator
    dialogIndicator.setVisible(false)
    return
  }

  const currentLine = dialogLines[currentDialogLineIndex]
  
  if (currentDialogCharIndex < currentLine.length) {
    // Type next character
    const textToShow = currentLine.substring(0, currentDialogCharIndex + 1)
    dialogText.setText(textToShow)
    currentDialogCharIndex++
    
    // Continue typing
    dialogTypingTimer = setTimeout(() => {
      typeDialogText.call(this)
    }, 30) // 30ms per character for typing speed
  } else {
    // Current line finished
    // Show indicator if there are more lines
    if (currentDialogLineIndex < dialogLines.length - 1) {
      dialogIndicator.setVisible(true)
      // Reset position and start jumping animation
      dialogScene.tweens.killTweensOf(dialogIndicator)
      const dialogHeight = 100
      const originalY = dialogHeight - 30
      dialogIndicator.y = originalY
      dialogScene.tweens.add({
        targets: dialogIndicator,
        y: originalY - 5,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    } else {
      dialogIndicator.setVisible(false)
    }
  }
}

const handleDialogAdvance = function () {
  // If still typing current line, skip to end
  if (currentDialogCharIndex < dialogLines[currentDialogLineIndex].length) {
    // Skip to end of current line
    if (dialogTypingTimer) {
      clearTimeout(dialogTypingTimer)
      dialogTypingTimer = null
    }
    dialogText.setText(dialogLines[currentDialogLineIndex])
    currentDialogCharIndex = dialogLines[currentDialogLineIndex].length
    
    // Show indicator if there are more lines
    if (currentDialogLineIndex < dialogLines.length - 1) {
      dialogIndicator.setVisible(true)
      // Reset position and start jumping animation
      dialogScene.tweens.killTweensOf(dialogIndicator)
      const dialogHeight = 100
      const originalY = dialogHeight - 30
      dialogIndicator.y = originalY
      dialogScene.tweens.add({
        targets: dialogIndicator,
        y: originalY - 5,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    } else {
      dialogIndicator.setVisible(false)
    }
    return
  }

  // Current line finished, check if there are more lines
  if (currentDialogLineIndex < dialogLines.length - 1) {
    // There are more lines, advance to next line
    currentDialogLineIndex++
    currentDialogCharIndex = 0
    dialogText.setText('')
    dialogIndicator.setVisible(false)
    // Stop indicator animation
    this.tweens.killTweensOf(dialogIndicator)
    typeDialogText.call(this)
  } else {
    // All lines shown, close dialog
    closeDialog.call(this)
  }
}

const closeDialog = function () {
  // Clear typing timer
  if (dialogTypingTimer) {
    clearTimeout(dialogTypingTimer)
    dialogTypingTimer = null
  }

  // Stop indicator animation
  if (dialogScene && dialogIndicator) {
    dialogScene.tweens.killTweensOf(dialogIndicator)
  }

  isDialogVisible = false
  dialogContainer.setVisible(false)
  dialogLines = []
  currentDialogLineIndex = 0
  currentDialogCharIndex = 0
  dialogIndicator.setVisible(false)
}
