# Google Sheets Manager

A Cocos Creator extension that automatically downloads data from Google Sheets and generates TypeScript classes for game data management.

## Features

- 📊 Download data from Google Sheets as CSV
- 💾 Save data as JSON files
- 🔧 Automatically generate TypeScript classes for each sheet
- 🎮 Generate `GameDataManager` class for centralized data management
- 🔄 Easy data synchronization with Google Sheets

## Installation

1. Copy the `gsheet` folder to your Cocos Creator project's `extensions` directory
2. Restart Cocos Creator
3. The extension will be automatically loaded

## Prerequisites

- Cocos Creator 3.8.8 or higher
- Node.js (for building the extension)
- Google Sheets with public sharing enabled (or CSV export enabled)

## Google Sheets Setup

### 1. Prepare Your Google Sheet

Your Google Sheet should follow this format:

| Column1 | Column2 | Column3 | ... |
|---------|---------|---------|-----|
| **Name** | **Type** | **Value** | ... |
| id | int | 1 | ... |
| name | string | Goblin | ... |
| hp | int | 100 | ... |

- **Row 1**: Column names (property names)
- **Row 2**: Data types (`int`, `long`, `double`, `float`, `string`, `bool`)
- **Row 3**: First data row (example values)
- **Row 4+**: Actual data rows

### 2. Get the Google Sheets URL

1. Open your Google Sheet
2. Click "Share" → "Get link" → Set to "Anyone with the link can view"
3. Copy the URL (format: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}`)

## Usage

### Opening the Panel

1. In Cocos Creator, go to `Extension` → `Google Sheets Manager` → `Open Sheets Manager`
2. The Google Sheets Manager panel will open

### Adding a Sheet

1. Enter a **Sheet Name** (e.g., `MobTable`)
2. Paste the **Google Sheets URL**
3. Click **Add**
4. The sheet will be added to the list

### Downloading Data

#### Download Single Sheet
- Click the **Download** button next to a sheet in the list
- This will:
  - Download CSV data from Google Sheets
  - Save as JSON file in `assets/resources/json/{SheetName}.json`
  - Generate TypeScript class in `assets/0_Scripts/GameData/{SheetName}.ts`

#### Download All JSON Files
- Click **Download All JSON** button
- Downloads all sheets as JSON files

#### Download All TypeScript Classes
- Click **Download All TypeScript** button
- This will:
  - Download all sheets as JSON files
  - Generate TypeScript classes for each sheet
  - Generate `GameDataManager.ts` in `assets/0_Scripts/GameDataManager.ts`

### Removing a Sheet

- Click the **X** button next to a sheet in the list

## Generated Files

After downloading, the following files will be created:

```
assets/
├── resources/
│   └── json/
│       ├── MobTable.json
│       └── ...
└── 0_Scripts/
    ├── GameData/
    │   ├── MobTable.ts
    │   └── ...
    └── GameDataManager.ts
```

## Using in Your Game

### 1. Initialize GameDataManager

```typescript
import { GameDataManager } from './GameDataManager';

// In your game initialization
GameDataManager.getInstance();
GameDataManager.localAllLoad(() => {
    console.log('All game data loaded!');
    // Your game logic here
});
```

### 2. Access Data

```typescript
import { GameDataManager, TABLE } from './GameDataManager';
import { MobTable } from './GameData/MobTable';

// Method 1: Get table by name
const mobTable = GameDataManager.getTable<MobTable>('MobTable');
if (mobTable) {
    // Get data by index
    const mobData = mobTable.getData(0);
    console.log(mobData.Name, mobData.MAX_HP);
    
    // Get data by key (first column value)
    const goblin = mobTable.getData('Goblin');
    
    // Get specific value
    const hp = mobTable.get(0, 'MAX_HP');
    
    // Check if key exists
    if (mobTable.containsKey('Goblin')) {
        // ...
    }
    
    // Get total count
    console.log('Total mobs:', mobTable.count);
}

// Method 2: Get table by enum
const mobTable2 = GameDataManager.getTableByEnum(TABLE.MobTable);

// Method 3: Check if table exists
if (GameDataManager.containsTable('MobTable')) {
    // ...
}
```

### 3. Complete Example

```typescript
import { _decorator, Component } from 'cc';
import { GameDataManager, TABLE } from './GameDataManager';
import { MobTable } from './GameData/MobTable';

const { ccclass } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
    start() {
        // Initialize and load data
        GameDataManager.getInstance();
        GameDataManager.localAllLoad(() => {
            console.log('Game data loaded!');
            
            // Use the data
            const mobTable = GameDataManager.getTable<MobTable>('MobTable');
            if (mobTable) {
                // Iterate through all mobs
                for (let i = 0; i < mobTable.count; i++) {
                    const mob = mobTable.getData(i);
                    if (mob) {
                        console.log(`${mob.Name}: HP=${mob.MAX_HP}, Gold=${mob.Gold}`);
                    }
                }
            }
        });
    }
}
```

## Generated Class Structure

### Sheet Class (e.g., `MobTable.ts`)

```typescript
@ccclass('MobTableData')
export class MobTableData {
    @property
    public Name: string = '';
    @property
    public MAX_HP: number = 0;
    // ... other properties
}

@ccclass('MobTable')
export class MobTable extends Component {
    // Get data by index or key
    public getData(row: string | number): MobTableData | null;
    
    // Get specific value
    public get(row: string | number, col: string): any;
    
    // Check if key exists
    public containsKey(key: string): boolean;
    
    // Check if column exists
    public containsColumnKey(name: string): boolean;
    
    // Get total count
    public get count(): number;
}
```

### GameDataManager Class

```typescript
@ccclass('GameDataManager')
export class GameDataManager extends Component {
    // Get singleton instance
    public static getInstance(): GameDataManager;
    public static get I(): GameDataManager;
    
    // Get table by name
    public static getTable<T>(tableName: string): T | null;
    
    // Get table by enum
    public static getTableByEnum(table: TABLE): any;
    
    // Check if table exists
    public static containsTable(tableName: string): boolean;
    
    // Load all data
    public static localAllLoad(complete?: () => void): void;
}
```

## Troubleshooting

### "Panel is not defined" Error

- Make sure the extension is properly installed in the `extensions` folder
- Restart Cocos Creator
- Check the console for detailed error messages

### CSV Download Fails

- Verify the Google Sheets URL is correct
- Make sure the sheet is publicly accessible
- Check if the sheet has the correct format (header rows)

### TypeScript Classes Not Generated

- Make sure `npm install` and `npm run build` have been run in the extension folder
- Check the console for compilation errors
- Verify the CSV data format is correct

### Data Not Loading in Game

- Make sure JSON files are in `assets/resources/json/`
- Verify the resource paths in `GameDataManager.localAllLoad()`
- Check the console for loading errors

## Development

### Building the Extension

```bash
cd extensions/gsheet
npm install
npm run build
```

### Project Structure

```
gsheet/
├── source/              # TypeScript source files
│   ├── main.ts         # Main entry point
│   ├── panels/         # Panel implementations
│   └── utils/          # Utility functions
├── dist/               # Compiled JavaScript
├── static/             # Static assets (HTML, CSS)
└── package.json        # Extension manifest
```

## License

This extension is provided as-is for use with Cocos Creator.

## Support

For issues or questions, please check:
- Cocos Creator documentation
- Extension console logs
- Google Sheets sharing settings
