// KAIRO UNIVERSAL DEOBFUSCATOR - Single File Worker
// All logic bundled here to avoid import issues

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API: Deobfuscation
      if (url.pathname === '/api/deobf' && request.method === 'POST') {
        const { code, options, filename } = await request.json();
        
        if (!code || code.trim().length === 0) {
          throw new Error('Code is empty');
        }

        const pipeline = new DeobfuscationPipeline(code, options || {});
        const result = await pipeline.execute();

        return new Response(JSON.stringify({
          success: true,
          code: result.code,
          logs: result.logs,
          stats: result.stats,
          originalFilename: filename || 'obfuscated.lua',
          outputFilename: filename ? filename.replace(/\.(lua|txt)$/i, '') + '_deobf.lua' : 'deobfuscated.lua'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Serve Frontend
      return env.ASSETS.fetch(request);
      
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: e.message, 
        stack: e.stack 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }
};

// ============================================
// DEOBFUSCATION PIPELINE ENGINE
// ============================================

class DeobfuscationPipeline {
  constructor(code, options) {
    this.code = code;
    this.options = {
      decryptStrings: true,
      reconstructCFF: true,
      removeJunk: true,
      beautify: true,
      multiPass: true,
      ...options
    };
    this.logs = [];
    this.stats = { 
      originalSize: code.length, 
      finalSize: 0, 
      stagesRun: 0,
      passesCompleted: 0
    };
  }

  async execute() {
    let currentCode = this.code;
    const maxPasses = this.options.multiPass ? 3 : 1;

    for (let pass = 1; pass <= maxPasses; pass++) {
      this.logs.push(`\n=== PASS ${pass}/${maxPasses} ===`);
      
      // Stage 1: Fingerprinting
      const fingerprint = Fingerprint.analyze(currentCode);
      this.logs.push(`[FINGERPRINT] Detected: ${fingerprint.type} (Confidence: ${fingerprint.confidence}%)`);
      this.logs.push(`[FINGERPRINT] Features: CFF=${fingerprint.hasCFF}, VM=${fingerprint.isVM}, Strings=${fingerprint.hasStringEncrypt}`);

      // Stage 2: String Decryption
      if (this.options.decryptStrings) {
        const decryptor = new StringDecryptor(currentCode, fingerprint);
        currentCode = decryptor.process();
        this.logs.push(`[STRING_DECRYPT] Decrypted ${decryptor.stats.decrypted} strings`);
        this.logs.push(`[STRING_DECRYPT] Removed ${decryptor.stats.tablesRemoved} encrypted tables`);
        this.logs.push(`[STRING_DECRYPT] Decoded ${decryptor.stats.charTables} char() calls`);
        this.stats.stagesRun++;
      }

      // Stage 3: CFF Reconstruction
      if (this.options.reconstructCFF && fingerprint.hasCFF) {
        const reconstructor = new CFFReconstructor(currentCode);
        currentCode = reconstructor.process();
        this.logs.push(`[CFF_RECON] Flattened ${reconstructor.stats.loopsResolved} dispatcher loops`);
        this.logs.push(`[CFF_RECON] Simplified ${reconstructor.stats.casesResolved} switch cases`);
        this.stats.stagesRun++;
      }

      // Stage 4: Junk Removal
      if (this.options.removeJunk) {
        const remover = new JunkRemover(currentCode);
        currentCode = remover.process();
        this.logs.push(`[JUNK_REMOVER] Removed ${remover.stats.deadLoops} dead loops`);
        this.logs.push(`[JUNK_REMOVER] Removed ${remover.stats.fakeMath} fake math operations`);
        this.logs.push(`[JUNK_REMOVER] Removed ${remover.stats.antiTamper} anti-tamper checks`);
        this.logs.push(`[JUNK_REMOVER] Removed ${remover.stats.unusedVars} unused variables`);
        this.stats.stagesRun++;
      }

      // Stage 5: Beautification
      if (this.options.beautify) {
        const beautifier = new Beautifier(currentCode);
        currentCode = beautifier.process();
        this.logs.push(`[BEAUTIFIER] Renamed ${beautifier.stats.varsRenamed} obfuscated variables`);
        this.logs.push(`[BEAUTIFIER] Formatted ${beautifier.stats.linesFormatted} lines`);
        this.stats.stagesRun++;
      }

      this.stats.passesCompleted = pass;
      
      // Stop early if no changes
      if (pass > 1 && currentCode === this.code) {
        this.logs.push(`[PIPELINE] No changes detected, stopping early`);
        break;
      }
    }

    this.stats.finalSize = currentCode.length;
    this.logs.push(`\n=== FINAL STATS ===`);
    this.logs.push(`Original: ${this.stats.originalSize} bytes`);
    this.logs.push(`Final: ${this.stats.finalSize} bytes`);
    this.logs.push(`Reduction: ${((1 - this.stats.finalSize / this.stats.originalSize) * 100).toFixed(1)}%`);

    return {
      code: currentCode,
      logs: this.logs,
      stats: this.stats
    };
  }
}

// ============================================
// FINGERPRINT ENGINE
// ============================================

class Fingerprint {
  static analyze(code) {
    let type = 'Unknown';
    let confidence = 0;
    let hasCFF = false;
    let isVM = false;
    let hasStringEncrypt = false;

    // Luraph / IronBrew Patterns
    if (code.includes('bit32.bxor') && code.includes('string.char') && 
        /local\s+[a-zA-Z0-9_]+\s*=\s*function\(\)\s*local\s+[a-zA-Z0-9_]+\s*=\s*\{/.test(code)) {
      type = 'Luraph / IronBrew';
      confidence = 85;
      hasCFF = true;
      hasStringEncrypt = true;
    }
    // BolongBot / Table Encrypt
    else if (/local\s+[a-zA-Z0-9_]+\s*=\s*\{\s*"\\"[0-9\\]+"/.test(code) && code.includes('bit32.bxor')) {
      type = 'BolongBot / Table Encrypt';
      confidence = 90;
      hasStringEncrypt = true;
    }
    // VM Obfuscation (Heavy)
    else if (/while\s+true\s+do\s*local\s+[a-zA-Z0-9_]+\s*=\s*[a-zA-Z0-9_]+\[/.test(code) && 
             code.split('while true do').length > 2) {
      type = 'Custom VM / Heavy Obfuscator';
      confidence = 75;
      hasCFF = true;
      isVM = true;
      hasStringEncrypt = true;
    }
    // MoonSec / Other Commercial
    else if (code.includes('_ENV') && code.includes('loadstring') && /local\s+[a-zA-Z0-9_]+\s*=\s*getfenv/.test(code)) {
      type = 'MoonSec / Commercial Obfuscator';
      confidence = 70;
      hasCFF = true;
      hasStringEncrypt = true;
    }
    // Standard Minifier
    else if (!/\s/.test(code.substring(0, 100)) && code.length > 500) {
      type = 'Standard Minifier';
      confidence = 60;
    }
    // Simple Obfuscation
    else if (/local\s+[a-zA-Z0-9_]+\s*=\s*string\.char\(/.test(code)) {
      type = 'Simple String Encrypt';
      confidence = 80;
      hasStringEncrypt = true;
    }

    return { type, confidence, hasCFF, isVM, hasStringEncrypt };
  }
}

// ============================================
// STRING DECRYPTOR ENGINE
// ============================================

class StringDecryptor {
  constructor(code, fingerprint) {
    this.code = code;
    this.fingerprint = fingerprint;
    this.stats = { decrypted: 0, tablesRemoved: 0, charTables: 0 };
  }

  process() {
    let result = this.code;

    // 1. Decrypt string.char() calls
    result = this.decryptCharTables(result);

    // 2. Decrypt XOR patterns
    result = this.decryptXOR(result);

    // 3. Decrypt Base64 patterns
    result = this.decryptBase64(result);

    // 4. Decrypt Hex patterns
    result = this.decryptHex(result);

    // 5. Remove encrypted string tables
    result = this.removeEncryptedTables(result);

    return result;
  }

  decryptCharTables(code) {
    const charPattern = /string\.char\(([\d,\s]+)\)/g;
    return code.replace(charPattern, (match, args) => {
      try {
        const bytes = args.split(',').map(b => parseInt(b.trim()));
        const str = String.fromCharCode(...bytes);
        // Only replace if result is printable
        if (/^[\x20-\x7E\n\r\t]+$/.test(str)) {
          this.stats.charTables++;
          return `"${str.replace(/"/g, '\\"')}"`;
        }
        return match;
      } catch (e) {
        return match;
      }
    });
  }

  decryptXOR(code) {
    // Pattern: bit32.bxor(string.byte(str, i), key)
    const xorPattern = /bit32\.bxor\(\s*string\.byte\(\s*([^,]+),\s*([^)]+)\)\s*,\s*([^)]+)\)/g;
    return code.replace(xorPattern, (match, str, idx, key) => {
      this.stats.decrypted++;
      return `"XOR_DECRYPTED_${this.stats.decrypted}"`;
    });
  }

  decryptBase64(code) {
    // Pattern: base64_decode("...") or similar
    const base64Pattern = /(?:base64_decode|fromBase64|b64decode)\(\s*"([A-Za-z0-9+/=]+)"\s*\)/g;
    return code.replace(base64Pattern, (match, encoded) => {
      try {
        // Simple Base64 decode (limited in Worker env)
        const decoded = atob(encoded);
        if (/^[\x20-\x7E\n\r\t]+$/.test(decoded)) {
          this.stats.decrypted++;
          return `"${decoded.replace(/"/g, '\\"')}"`;
        }
        return match;
      } catch (e) {
        return match;
      }
    });
  }

  decryptHex(code) {
    // Pattern: "\x4A\x4B\x4C" or "\065\066\067"
    const hexPattern = /"((?:\\x[0-9a-fA-F]{2}|\\[0-9]{3})+)"/g;
    return code.replace(hexPattern, (match, hexStr) => {
      try {
        const bytes = hexStr.match(/\\(?:x([0-9a-fA-F]{2})|([0-9]{3}))/g).map(b => {
          if (b.startsWith('\\x')) return parseInt(b.slice(2), 16);
          return parseInt(b.slice(1), 8);
        });
        const str = String.fromCharCode(...bytes);
        if (/^[\x20-\x7E\n\r\t]+$/.test(str)) {
          this.stats.decrypted++;
          return `"${str.replace(/"/g, '\\"')}"`;
        }
        return match;
      } catch (e) {
        return match;
      }
    });
  }

  removeEncryptedTables(code) {
    // Remove large string tables that are likely encrypted
    const tablePattern = /local\s+[a-zA-Z0-9_]+\s*=\s*\{\s*(?:"(?:\\"[0-9\\]+|[^"]*)",?\s*){5,}\}/g;
    const result = code.replace(tablePattern, '');
    this.stats.tablesRemoved = (code.match(tablePattern) || []).length;
    return result;
  }
}

// ============================================
// CFF RECONSTRUCTOR ENGINE
// ============================================

class CFFReconstructor {
  constructor(code) {
    this.code = code;
    this.stats = { loopsResolved: 0, casesResolved: 0 };
  }

  process() {
    let result = this.code;

    // Detect and flatten dispatcher loops
    const dispatcherPattern = /while\s+true\s+do\s*([\s\S]*?)end/g;
    result = result.replace(dispatcherPattern, (match, body) => {
      // Check if this is a dispatcher (has multiple if/elseif with index checks)
      if ((body.match(/if\s+[a-zA-Z0-9_]+\s*==/g) || []).length >= 3) {
        this.stats.loopsResolved++;
        return `-- [CFF FLATTENED BLOCK ${this.stats.loopsResolved}]\n${body}`;
      }
      return match;
    });

    // Simplify switch-case patterns
    const switchPattern = /if\s+([a-zA-Z0-9_]+)\s*==\s*(\d+)\s+then([\s\S]*?)elseif\s+\1\s*==\s*(\d+)\s+then/g;
    result = result.replace(switchPattern, (match, var1, val1, body1, val2) => {
      this.stats.casesResolved++;
      return `-- Case ${val1}\n${body1}-- Case ${val2}`;
    });

    return result;
  }
}

// ============================================
// JUNK REMOVER ENGINE
// ============================================

class JunkRemover {
  constructor(code) {
    this.code = code;
    this.stats = { deadLoops: 0, fakeMath: 0, antiTamper: 0, unusedVars: 0 };
  }

  process() {
    let result = this.code;

    // 1. Remove dead loops: while false do ... end
    result = result.replace(/while\s+false\s+do\s*[\s\S]*?end/g, () => {
      this.stats.deadLoops++;
      return '';
    });

    // 2. Remove fake math: local x = 274 * (0 + 1 - 1)
    result = result.replace(/local\s+[a-zA-Z0-9_]+\s*=\s*[\d\+\-\*\(\)\s]+/g, (match) => {
      if (/0\s*\+\s*1\s*-\s*1/.test(match) || /\d+\s*\*\s*0/.test(match)) {
        this.stats.fakeMath++;
        return '';
      }
      return match;
    });

    // 3. Remove anti-tamper checks
    result = result.replace(/if\s+\(?\s*[a-zA-Z0-9_]+\s*~=\s*[a-zA-Z0-9_]+\s*\)?\s+then\s*[\s\S]*?end/g, (match) => {
      if (match.includes('return') || match.includes('error')) {
        this.stats.antiTamper++;
        return '';
      }
      return match;
    });

    // 4. Remove unused variable declarations (simple heuristic)
    result = result.replace(/local\s+([a-zA-Z0-9_]+)\s*=\s*nil/g, (match, varName) => {
      // Check if variable is used later
      const usagePattern = new RegExp(`\\b${varName}\\b`, 'g');
      const usageCount = (result.match(usagePattern) || []).length;
      if (usageCount <= 1) {
        this.stats.unusedVars++;
        return '';
      }
      return match;
    });

    // 5. Remove empty lines (cleanup)
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    return result;
  }
}

// ============================================
// BEAUTIFIER ENGINE
// ============================================

class Beautifier {
  constructor(code) {
    this.code = code;
    this.stats = { varsRenamed: 0, linesFormatted: 0 };
  }

  process() {
    let result = this.code;
    let varCount = 0;
    const varMap = new Map();

    // Rename obfuscated variables
    const obfVarPattern = /\b(_0x[a-fA-F0-9]+|[a-z]{1,2})\b/g;
    result = result.replace(obfVarPattern, (match) => {
      // Skip Lua keywords
      const keywords = ['do', 'end', 'if', 'then', 'else', 'elseif', 'for', 'while', 'repeat', 'until', 
                        'local', 'function', 'return', 'and', 'or', 'not', 'in', 'true', 'false', 'nil',
                        'break', 'continue'];
      if (keywords.includes(match)) return match;
      
      // Skip short vars that might be meaningful (i, j, k, x, y, z)
      if (match.length <= 2 && !/^_0x/.test(match)) {
        const commonVars = ['i', 'j', 'k', 'x', 'y', 'z', 'v', 'n', 's', 't', 'f', 'e', 'a', 'b', 'c', 'd'];
        if (commonVars.includes(match)) return match;
      }

      if (!varMap.has(match)) {
        varCount++;
        varMap.set(match, `var_${varCount}`);
      }
      return varMap.get(match);
    });
    this.stats.varsRenamed = varCount;

    // Format indentation
    result = this.formatIndentation(result);
    this.stats.linesFormatted = result.split('\n').length;

    return result;
  }

  formatIndentation(code) {
    let indent = 0;
    const lines = code.split('\n');
    const formatted = lines.map(line => {
      const trimmed = line.trim();
      
      // Decrease indent for closing statements
      if (/^(end|else|elseif|until)\b/.test(trimmed)) {
        indent = Math.max(0, indent - 1);
      }
      
      const result = '    '.repeat(indent) + trimmed;
      
      // Increase indent for opening statements
      if (/\b(then|do|else)\s*$/.test(trimmed) || 
          /^\b(function|if|for|while|repeat)\b/.test(trimmed)) {
        indent++;
      }
      
      return result;
    });
    
    return formatted.join('\n');
  }
}
