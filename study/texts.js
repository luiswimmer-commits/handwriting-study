// The study page's words (T-112): English for the groups math and en, Portuguese (read in Brazil and in Portugal) for pt. Few, plain and short: the
// writers are strangers, some reading their second language. The agreement itself is docs/release/study-agreement.<lang>.md (shown as it is).
export const AGREEMENT_VERSION = '0.1';   // the version line of docs/release/study-agreement.en.md and .pt.md (tests/study/study.test.js checks it)
export const STUDY_VERSION = 'study-0.1'; // sent as the payload's `app`: which page made the row

const EN = {
  title: 'Handwriting study',
  agree: 'I agree',
  disagree: 'I do not agree',
  declinedTitle: 'Nothing was stored.',
  declined: 'You did not agree. Please go back to Prolific.',
  checkTitle: 'Stylus check',
  checkAsk: 'Write this word with your stylus.',
  checkWord: 'hello',
  onlyPen: 'Use your stylus. Only a stylus writes here.',
  againPen: 'Only a stylus counts. Please write it again with your stylus.',
  noDeviceTitle: 'This study needs a tablet and a stylus.',
  noDevice: 'For example an Apple Pencil or an S Pen. Please go back to Prolific.',
  backToProlific: 'Back to Prolific',
  practice: (i, n) => `Practice ${i} of ${n}`,
  counter: (i, n) => `${i} of ${n}`,
  howToWrite: 'Copy it as you normally write: print or joined.',
  clear: 'Clear',
  next: 'Next',
  sending: 'Storing your writing...',
  offline: 'No connection. Your writing is kept on this page and will be sent.',
  refused: 'Your writing could not be stored yet.',
  tryAgain: 'Try again',
  doneTitle: 'Thank you!',
  done: 'All your writing is stored.',
  notSetUp: 'This page is not set up yet.',
  badLink: 'Please open this page from Prolific.',
};

const PT = {
  title: 'Estudo de escrita à mão',
  agree: 'Concordo',
  disagree: 'Não concordo',
  declinedTitle: 'Nada foi guardado.',
  declined: 'Você não concordou. Volte ao Prolific.',
  checkTitle: 'Teste da caneta',
  checkAsk: 'Escreva esta palavra com a sua caneta.',
  checkWord: 'olá',
  onlyPen: 'Use a sua caneta. Só a caneta escreve aqui.',
  againPen: 'Só vale a caneta. Escreva de novo com a sua caneta.',
  noDeviceTitle: 'Este estudo precisa de um tablet e de uma caneta.',
  noDevice: 'Por exemplo, Apple Pencil ou S Pen. Volte ao Prolific.',
  backToProlific: 'Voltar ao Prolific',
  practice: (i, n) => `Treino ${i} de ${n}`,
  counter: (i, n) => `${i} de ${n}`,
  howToWrite: 'Copie como você costuma escrever: letra de forma ou cursiva.',
  clear: 'Limpar',
  next: 'Avançar',
  sending: 'Guardando a sua escrita...',
  offline: 'Sem conexão. A sua escrita fica nesta página e será enviada.',
  refused: 'Ainda não foi possível guardar a sua escrita.',
  tryAgain: 'Tentar de novo',
  doneTitle: 'Obrigado!',
  done: 'Toda a sua escrita foi guardada.',
  notSetUp: 'Esta página ainda não está configurada.',
  badLink: 'Abra esta página pelo Prolific.',
};

export const TEXTS = Object.freeze({ en: Object.freeze(EN), pt: Object.freeze(PT) });
export const textsFor = (lang) => TEXTS[lang === 'pt' ? 'pt' : 'en'];
