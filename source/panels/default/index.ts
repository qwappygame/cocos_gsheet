import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { loadSheetsData, saveSheetsData, convertToCsvUrl, downloadCsv, parseCsvToJson, SheetData } from '../../utils/sheetsManager';
import { generateTypeScriptClass, generateGameDataManager } from '../../utils/classGenerator';
import { writeFileSync, existsSync, mkdirSync } from 'fs-extra';

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('[Google Sheets Manager] 패널 표시');
        },
        hide() {
            console.log('[Google Sheets Manager] 패널 숨김');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        sheetName: '#sheetName',
        sheetUrl: '#sheetUrl',
        addBtn: '#addBtn',
        listContainer: '#listContainer',
        downloadAllJson: '#downloadAllJson',
        downloadAllTS: '#downloadAllTS',
    },
    methods: {
        async addSheet() {
            console.log('[Google Sheets Manager] addSheet 메서드 호출');
            
            const sheetNameEl = Array.isArray(this.$.sheetName) ? this.$.sheetName[0] : this.$.sheetName;
            const sheetUrlEl = Array.isArray(this.$.sheetUrl) ? this.$.sheetUrl[0] : this.$.sheetUrl;
            
            const sheetName = sheetNameEl?.value || '';
            const sheetUrl = sheetUrlEl?.value || '';
            
            console.log('[Google Sheets Manager] Sheet Name:', sheetName);
            console.log('[Google Sheets Manager] Sheet URL:', sheetUrl);
            
            if (!sheetName || !sheetUrl) {
                Editor.Dialog.warn('Sheet Name과 URL을 입력해주세요.');
                return;
            }
            
            const sheets = loadSheetsData();
            sheets.push({ name: sheetName, url: sheetUrl });
            saveSheetsData(sheets);
            
            if (sheetNameEl) sheetNameEl.value = '';
            if (sheetUrlEl) sheetUrlEl.value = '';
            
            this.updateList();
        },
        
        removeSheet(index: number) {
            const sheets = loadSheetsData();
            sheets.splice(index, 1);
            saveSheetsData(sheets);
            this.updateList();
        },
        
        async downloadSheet(index: number) {
            const sheets = loadSheetsData();
            const sheet = sheets[index];
            
            Editor.Dialog.info('다운로드 중...', { title: 'Google Sheets Manager' });
            
            try {
                const csvUrl = convertToCsvUrl(sheet.url);
                const csv = await downloadCsv(csvUrl);
                const json = parseCsvToJson(csv, sheet.name);
                
                // JSON 저장
                const jsonPath = join(Editor.Project.path, 'assets/resources/json', `${sheet.name}.json`);
                const jsonDir = join(Editor.Project.path, 'assets/resources/json');
                if (!existsSync(jsonDir)) {
                    mkdirSync(jsonDir, { recursive: true });
                }
                writeFileSync(jsonPath, json, 'utf8');
                
                // TypeScript 클래스 생성
                generateTypeScriptClass(sheet.name, csv, Editor.Project.path);
                
                Editor.Dialog.info('다운로드 완료!', { title: 'Google Sheets Manager' });
                Editor.Message.request('asset-db', 'refresh-asset', '');
                
                // 목록 새로고침
                this.updateList();
            } catch (err: any) {
                Editor.Dialog.error('다운로드 실패: ' + err.message, { title: 'Google Sheets Manager' });
            }
        },
        
        async downloadAllJson() {
            Editor.Dialog.info('모든 JSON 다운로드 중...', { title: 'Google Sheets Manager' });
            const sheets = loadSheetsData();
            
            for (let i = 0; i < sheets.length; i++) {
                await this.downloadSheet(i);
            }
            
            Editor.Dialog.info('모든 다운로드 완료!', { title: 'Google Sheets Manager' });
        },
        
        async downloadAllTypeScript() {
            Editor.Dialog.info('TypeScript 클래스 생성 중...', { title: 'Google Sheets Manager' });
            
            try {
                const projectPath = Editor.Project.path;
                const sheets = loadSheetsData();
                const sheetNames: string[] = [];
                
                for (const sheet of sheets) {
                    const csvUrl = convertToCsvUrl(sheet.url);
                    const csv = await downloadCsv(csvUrl);
                    
                    // JSON 저장
                    const json = parseCsvToJson(csv, sheet.name);
                    const jsonPath = join(projectPath, 'assets/resources/json', `${sheet.name}.json`);
                    const jsonDir = join(projectPath, 'assets/resources/json');
                    if (!existsSync(jsonDir)) {
                        mkdirSync(jsonDir, { recursive: true });
                    }
                    writeFileSync(jsonPath, json, 'utf8');
                    
                    // TypeScript 클래스 생성
                    generateTypeScriptClass(sheet.name, csv, projectPath);
                    sheetNames.push(sheet.name);
                }
                
                // GameDataManager 생성
                if (sheetNames.length > 0) {
                    generateGameDataManager(sheetNames, projectPath);
                }
                
                Editor.Dialog.info('TypeScript 클래스 생성 완료!', { title: 'Google Sheets Manager' });
                Editor.Message.request('asset-db', 'refresh-asset', '');
            } catch (err: any) {
                Editor.Dialog.error('TypeScript 클래스 생성 실패: ' + err.message, { title: 'Google Sheets Manager' });
            }
        },
        
        updateList() {
            const listContainer = Array.isArray(this.$.listContainer) ? this.$.listContainer[0] : this.$.listContainer;
            if (!listContainer) {
                console.error('[Google Sheets Manager] listContainer를 찾을 수 없습니다!');
                return;
            }
            
            const sheets = loadSheetsData();
            listContainer.innerHTML = '';
            
            sheets.forEach((sheet: SheetData, index: number) => {
                const div = document.createElement('div');
                div.style.cssText = 'display: flex; align-items: center; margin-bottom: 10px; padding: 10px; background: #252526; border-radius: 4px;';
                
                div.innerHTML = `
                    <span style="flex: 1; margin-right: 10px; font-weight: bold;">${sheet.name}</span>
                    <span style="flex: 2; margin-right: 10px; color: #888; font-size: 12px; overflow: hidden; text-overflow: ellipsis;">${sheet.url}</span>
                    <button class="download-btn" data-index="${index}" style="padding: 5px 10px; background: #0e639c; color: #fff; border: none; cursor: pointer; margin-right: 5px; border-radius: 3px;">Download</button>
                    <button class="remove-btn" data-index="${index}" style="padding: 5px 10px; background: #f00; color: #fff; border: none; cursor: pointer; border-radius: 3px;">X</button>
                `;
                
                listContainer.appendChild(div);
                
                const downloadBtn = div.querySelector('.download-btn');
                const removeBtn = div.querySelector('.remove-btn');
                
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', () => {
                        this.downloadSheet(index);
                    });
                }
                
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        this.removeSheet(index);
                    });
                }
            });
        },
    },
    ready() {
        console.log('[Google Sheets Manager] 패널 준비 완료');
        console.log('[Google Sheets Manager] this.$:', this.$);
        
        const addBtn = Array.isArray(this.$.addBtn) ? this.$.addBtn[0] : this.$.addBtn;
        const downloadAllJson = Array.isArray(this.$.downloadAllJson) ? this.$.downloadAllJson[0] : this.$.downloadAllJson;
        const downloadAllTS = Array.isArray(this.$.downloadAllTS) ? this.$.downloadAllTS[0] : this.$.downloadAllTS;
        
        console.log('[Google Sheets Manager] addBtn:', addBtn);
        console.log('[Google Sheets Manager] downloadAllJson:', downloadAllJson);
        console.log('[Google Sheets Manager] downloadAllTS:', downloadAllTS);
        
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                console.log('[Google Sheets Manager] Add 버튼 클릭됨');
                this.addSheet();
            });
        } else {
            console.error('[Google Sheets Manager] addBtn을 찾을 수 없습니다!');
        }
        
        if (downloadAllJson) {
            downloadAllJson.addEventListener('click', () => {
                this.downloadAllJson();
            });
        }
        
        if (downloadAllTS) {
            downloadAllTS.addEventListener('click', () => {
                this.downloadAllTypeScript();
            });
        }
        
        this.updateList();
    },
    beforeClose() {},
    close() {},
});
