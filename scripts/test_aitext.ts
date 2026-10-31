/**
 * Uji pembersih metadata AI (BAGIAN 5) — lib/aiText.ts
 * Jalankan: npx tsx scripts/test_aitext.ts
 */
import { cleanAiText } from '../lib/aiText';

let pass = 0, fail = 0;
function eq(name: string, got: string, want: string) {
  const ok = got === want;
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
}
function has(name: string, got: string, must: string, mustNot: string) {
  const ok = got.includes(must) && !got.includes(mustNot);
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}\n   got: ${JSON.stringify(got)}\n   must contain ${JSON.stringify(must)}, must NOT contain ${JSON.stringify(mustNot)}`); }
}

// 1. Direktif :::writing + isi setelahnya
eq('directive+content',
  cleanAiText(':::writing{variant="chat_message"}\nHalo! Ada yang bisa saya bantu?\n:::'),
  'Halo! Ada yang bisa saya bantu?');

// 2. Isi di DALAM metadata (content="...")
eq('content-inside',
  cleanAiText(':::writing{variant="chat_message", content="Hai, selamat pagi!"}:::'),
  'Hai, selamat pagi!');

// 3. <think> lengkap
eq('think-block',
  cleanAiText('<think>penalaran rahasia 1+1</think>Jawabannya 2.'),
  'Jawabannya 2.');

// 4. <think> terpotong tanpa penutup
eq('think-unclosed',
  cleanAiText('<think>penalaran panjang yang terpotong'),
  '');

// 5. Penutup ::: yatim
eq('orphan-close',
  cleanAiText('Halo semuanya\n:::'),
  'Halo semuanya');

// 6. Kode biasa (backtick) TIDAK ikut terhapus — AI bantu pemrograman tetap utuh
const code = 'Berikut contohnya:\n\n```js\nconst a = { b: 1 };\n```\n\nSemoga membantu!';
eq('code-untouched', cleanAiText(code), code);

// 7. Teks normal tidak berubah
const normal = 'Halo! *miring* **tebal** @zeroid 😊';
eq('normal-untouched', cleanAiText(normal), normal);

// 8. JSON content dengan escape
has('json-content',
  cleanAiText(':::social_post{variant="social_post", content="Halo\\nSemua"}\n:::'),
  'Halo', 'variant');

// 9. TOOL_CALL header dibuang
eq('toolcall', cleanAiText('[TOOL_CALL]dummy\nJawaban asli'), 'Jawaban asli');

// 10. Tidak melempar pada string kosong
eq('empty', cleanAiText(''), '');

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
