/* Configuração do Firebase da Mel.
   Cole aqui o bloco "firebaseConfig" do console do Firebase (Configurações do projeto > Seus apps > App da Web).
   Esses dados são públicos: a proteção dos dados está nas regras do Firestore (firestore.rules). */
window.MEL_FIREBASE = {
  apiKey: "AIzaSyAd9bKfaWENH1cMvw0ITGaYkRUFO8qJZPw",
  authDomain: "mel-juridico.firebaseapp.com",
  projectId: "mel-juridico",
  storageBucket: "mel-juridico.firebasestorage.app",
  messagingSenderId: "240378571063",
  appId: "1:240378571063:web:76a65822b225ab2a61d2b2"
};
/* E-mail do dono da Mel: o único que entra sem aprovação e aprova os primeiros acessos.
   Precisa ser o mesmo e-mail gravado em firestore.rules. */
window.MEL_DONO = "ricardomca@outlook.com";
