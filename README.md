# Convert Timezone Chrome Extension

A powerful Chrome extension that intelligently converts dates and times between any timezones with a beautiful, minimal interface.

## ✨ Features

### 🌍 Universal Timezone Conversion
- Convert between **any** timezones worldwide
- Smart auto-detection of user's current timezone
- Support for 400+ timezone locations
- Searchable timezone selection by country, city, or timezone name

### 🎯 Smart Context Menu Integration
- Right-click any date/time text on websites
- Select "Convert Time" to instantly open the extension popup
- Automatically fills selected text and attempts conversion
- Works on any website

### 🔍 Intelligent Date/Time Parsing
- Supports multiple date/time formats
- Natural language detection (e.g., "Tuesday, September 2, 2025 12:00 PM PST")
- Timezone abbreviation recognition (PST, EST, UTC, etc.)
- Handles time ranges and complex formats

### 💎 Beautiful Minimal Design
- Translucent gradient background
- Clean white dropdowns and inputs
- Searchable timezone dropdowns
- Responsive and intuitive interface

## 🚀 How to Use

### Method 1: Context Menu (Recommended)
1. **Select** any date/time text on any webpage
2. **Right-click** and choose "Convert Time"
3. The extension popup opens with your selected text
4. **Choose** source and target timezones (or use auto-detect)
5. **Click** "Convert Time" to see the result

### Method 2: Manual Entry
1. **Click** the extension icon in your browser toolbar
2. **Enter** a date/time in the input field
3. **Select** "From" and "To" timezones using the dropdowns
4. **Click** "Convert Time" to see the conversion

## 🔧 Installation

### From Chrome Web Store
*Coming soon...*

### Manual Installation (Developer Mode)
1. **Download** or clone this repository
2. **Open** Chrome and go to `chrome://extensions/`
3. **Enable** "Developer mode" (top right)
4. **Click** "Load unpacked" and select the `time-converter-build/` folder
5. **Done!** The extension is now installed

## 🌟 Key Features Explained

### Smart Timezone Detection
- **Auto-detect**: Automatically uses your system timezone
- **Search by Country**: Type "USA", "India", "UK" to find relevant timezones
- **Search by City**: Type "New York", "London", "Tokyo" to find specific timezones
- **UTC Offset Display**: Shows UTC+XX:XX for easy reference

### Supported Date/Time Formats
- `Tuesday, September 2, 2025 12:00 PM PST`
- `Sep 2, 2025 12:00 PM`
- `09/02/2025 12:00 PM`
- `2025-09-02 12:00`
- Time ranges: `10:00 AM - 2:00 PM EST`
- And many more natural formats!

### Timezone Abbreviations Supported
- **US**: PST, PDT, EST, EDT, CST, CDT, MST, MDT
- **International**: UTC, GMT, IST, BST, JST, etc.
- **Named Timezones**: America/New_York, Europe/London, Asia/Tokyo, etc.

## 🎨 Design Philosophy

The extension follows a **minimal, translucent design** that's both beautiful and functional:
- **Gradient Background**: Elegant purple gradient for visual appeal
- **Translucent Elements**: Subtle transparency for modern look
- **White Controls**: Clean white dropdowns and inputs for clarity
- **Smooth Interactions**: Hover effects and transitions for polish

## 🔄 Recent Updates

### v1.0.0 - Complete Redesign
- ✅ Renamed to "Convert Timezone"
- ✅ Added dual timezone dropdown menus
- ✅ Implemented searchable timezone selection
- ✅ Context menu now opens extension popup
- ✅ New white clock icon design
- ✅ Removed fixed IST conversion
- ✅ Universal timezone support
- ✅ Improved UI/UX with better styling

## 🛠️ Technical Details

### Built With
- **Manifest V3** for modern Chrome extension standards
- **Moment.js + Moment Timezone** for robust date/time handling
- **Vanilla JavaScript** for lightweight performance
- **CSS3** with gradients and backdrop filters for modern styling

### Permissions Used
- `activeTab`: To access selected text on current webpage
- `contextMenus`: To add right-click menu option
- `storage`: To pass data between context menu and popup
- `scripting`: For content script injection (fallback only)

## 📱 Browser Compatibility

- ✅ **Chrome** 88+ (Manifest V3 support)
- ✅ **Edge** 88+ (Chromium-based)
- ✅ **Opera** 74+ (Chromium-based)
- ❌ Firefox (Manifest V3 limited support)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

If you encounter any issues or have feature requests, please [open an issue](https://github.com/akhil-saxena/convert-timezone/issues) on GitHub.

---

**Enjoy seamless timezone conversions! 🌍⏰**
