/** Uji cleanAiText — semua kasus kebocoran metadata harus bersih. */
import { cleanAiText } from '../lib/aiText';

const cases: [string, string, string][] = [
  ['directive writing', ':::writing{variant="chat_message"}\nHalo, apa kabar?\n:::', 'Halo, apa kabar?'],
  ['json wrapper content', '{"variant":"chat_message","content":"Hai semuanya!"}', 'Hai semuanya!'],
  ['json wrapper text', '{"variant":"chat_message","text":"Jawaban singkat."}', 'Jawaban singkat.'],
  ['bare variant token', 'variant="chat_message" Halo!', 'Halo!'],
  ['think block', '<think>rahasia</think>Jawabannya ya.', 'Jawabannya ya.'],
  ['tool call', '[TOOL_CALL]{"name":"x"}\nIsi jawaban', 'Isi jawaban'],
  ['plain text untouched', 'Ini teks biasa tanpa metadata.', 'Ini teks biasa tanpa metadata.'],
  ['multiline json', 'Sebentar ya...\n{"variant":"chat_message","content":"Ini jawaban panjang\\ndengan baris baru"}\nTerima kasih', 'Sebentar ya...\nIni jawaban panjang\ndengan baris baru\nTerima kasih'],
];

let pass = 0;
for (const [name, input, want] of cases) {
  const got = cleanAiText(input);
  const ok = got.trim() === want.trim();
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log('  input :', JSON.stringify(input));
    console.log('  want  :', JSON.stringify(want));
    console.log('  got   :', JSON.stringify(got));
  } else pass++;
}
console.log(`\n${pass}/${cases.length} PASS`);
process.exit(pass === cases.length ? 0 : 1);
