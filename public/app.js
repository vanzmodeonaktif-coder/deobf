require.config({ 
    paths: { 
        vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' 
    } 
});

let editorInput, editorOutput;
let lastResult = null;

require(['vs/editor/editor.main'], function () {
    // Custom Theme
    monaco.editor.defineTheme('kairoDark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
            { token: 'string', foreground: '00ff9d' },
            { token: 'keyword', foreground: 'ff0055' },
            { token: 'number', foreground: '00f3ff' },
            { token: 'function', foreground: 'b026ff' }
        ],
        colors: { 
            'editor.background': '#12121a', 
            'editor.foreground': '#e0e0e0',
            'editor.lineHighlightBackground': '#1a1a24',
            'editorCursor.foreground': '#00f3ff'
        }
    });

    editorInput = monaco.editor.create(document.getElementById('editor-input'), {
        value: '-- Paste obfuscated Lua code here...\n-- Or upload .lua/.txt file',
        language: 'lua',
        theme: 'kairoDark',
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true
    });

    editorOutput = monaco.editor.create(document.getElementById('editor-output'), {
        value: '-- Clean code will appear here...',
        language: 'lua',
        theme: 'kairoDark',
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true
    });

    window.addEventListener('resize', () => {
        editorInput.layout();
        editorOutput.layout();
    });
});

// File Upload Handler
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.match(/\.(lua|txt)$/i)) {
        log('[ERROR] Only .lua and .txt files are supported');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        editorInput.setValue(e.target.result);
        log(`[UPLOAD] Loaded ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    };
    reader.onerror = () => log('[ERROR] Failed to read file');
    reader.readAsText(file);
}

// Deobfuscate Handler
document.getElementById('btn-deobf').addEventListener('click', async () => {
    const code = editorInput.getValue();
    const btn = document.getElementById('btn-deobf');
    
    if (!code || code.trim().length < 10) {
        log('[ERROR] Code too short or empty');
        return;
    }

    btn.classList.add('loading');
    btn.disabled = true;
    log('[INIT] Starting deobfuscation pipeline...');

    const startTime = Date.now();
    const options = {
        decryptStrings: document.getElementById('opt-strings').checked,
        reconstructCFF: document.getElementById('opt-cff').checked,
        removeJunk: document.getElementById('opt-junk').checked,
        beautify: document.getElementById('opt-beautify').checked,
        multiPass: document.getElementById('opt-multipass').checked
    };

    try {
        const response = await fetch('/api/deobf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                code, 
                options,
                filename: 'input.lua'
            })
        });

        const data = await response.json();

        if (data.success) {
            editorOutput.setValue(data.code);
            lastResult = data;
            
            const duration = Date.now() - startTime;
            log(`[SUCCESS] Pipeline completed in ${duration}ms`);
            log(`[STATS] Original: ${data.stats.originalSize} bytes → Final: ${data.stats.finalSize} bytes`);
            log(`[STATS] Reduction: ${((1 - data.stats.finalSize / data.stats.originalSize) * 100).toFixed(1)}%`);
            log(`[STATS] Stages: ${data.stats.stagesRun} | Passes: ${data.stats.passesCompleted}`);
            log('\n' + data.logs.join('\n'));
            
            document.getElementById('btn-download').disabled = false;
            document.querySelector('.editor-panel:last-child').classList.add('success');
            setTimeout(() => {
                document.querySelector('.editor-panel:last-child').classList.remove('success');
            }, 1000);
        } else {
            log(`[ERROR] ${data.error}`);
        }
    } catch (e) {
        log(`[FATAL] ${e.message}`);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
});

// Download Handler
document.getElementById('btn-download').addEventListener('click', () => {
    if (!lastResult) return;
    
    const blob = new Blob([lastResult.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastResult.outputFilename || 'deobfuscated.lua';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    log(`[DOWNLOAD] Saved ${a.download}`);
});

// Copy Output
function copyOutput() {
    const code = editorOutput.getValue();
    navigator.clipboard.writeText(code).then(() => {
        log('[COPY] Output copied to clipboard');
    }).catch(() => {
        log('[ERROR] Failed to copy');
    });
}

// Clear Logs
function clearLogs() {
    document.getElementById('log-output').textContent = '[READY] Waiting for input...';
}

// Log Helper
function log(message) {
    const logOutput = document.getElementById('log-output');
    const timestamp = new Date().toLocaleTimeString();
    logOutput.textContent += `\n[${timestamp}] ${message}`;
    logOutput.scrollTop = logOutput.scrollHeight;
}
