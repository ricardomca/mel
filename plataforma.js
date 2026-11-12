/* Mel fora do Claude: implementa sobre o Firebase a mesma interface que a Mel usa dentro do Claude
   (window.claude.use('db' | 'user' | 'assets' | 'downloads')). Assim o mesmo código roda nos dois lugares. */
(function(){
  'use strict';
  window.MEL_SITE = true;
  const cfg = window.MEL_FIREBASE || {};
  const DONO = String(window.MEL_DONO || '').trim().toLowerCase();
  if (!cfg.apiKey || !window.firebase) { window.MEL_SEM_CONFIG = true; window.claude = { use: async () => null }; return; }
  firebase.initializeApp(cfg);
  const auth = firebase.auth(); auth.languageCode = 'pt';
  const fs = firebase.firestore();
  /* ---------- sessão: acaba ao fechar o navegador e após 30 minutos sem uso ---------- */
  const INATIVO_MIN = 30, AVISO_SEG = 60;
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
               del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };
  const PERS = firebase.auth.Auth && firebase.auth.Auth.Persistence;
  const persistir = (PERS && auth.setPersistence) ? auth.setPersistence(PERS.SESSION).catch(() => {}) : Promise.resolve();
  const motivoSaida = ss.get('mel-saiu'); ss.del('mel-saiu');
  const marcarEntrada = () => { ss.set('mel-sessao', '1'); ss.set('mel-ult', String(Date.now())); };
  async function sairPor(motivo){ ss.set('mel-saiu', motivo); ss.del('mel-sessao'); ss.del('mel-ult'); try { await auth.signOut(); } catch (e) {} location.reload(); }
  let ult = Date.now(), gravado = 0, aviso = null;
  function atividade(){ ult = Date.now(); if (ult - gravado > 5000) { gravado = ult; ss.set('mel-ult', String(ult)); } if (aviso) esconderAviso(); }
  function mostrarAviso(seg){
    if (!aviso) { aviso = document.createElement('div'); aviso.id = 'melAviso'; aviso.setAttribute('role', 'alertdialog'); aviso.setAttribute('aria-live', 'assertive');
      aviso.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px);padding:12px 12px 12px 18px;border-radius:16px;background:#1E2433;color:#fff;font:500 14px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 12px 40px rgba(16,24,40,.28)';
      aviso.innerHTML = '<span>Por segurança, a Mel vai sair em <b id="melAvisoSeg"></b> s por falta de uso.</span><button type="button" style="border:0;border-radius:10px;padding:9px 14px;background:#F2B705;color:#1C1710;font:600 14px/1 system-ui,-apple-system,sans-serif;cursor:pointer">Continuar conectado</button>';
      aviso.querySelector('button').addEventListener('click', atividade); document.body.appendChild(aviso); }
    aviso.querySelector('#melAvisoSeg').textContent = String(Math.max(0, seg)); }
  function esconderAviso(){ if (aviso) { aviso.remove(); aviso = null; } }
  function vigiar(){ const lim = INATIVO_MIN * 60000;
    const checar = () => { const parado = Date.now() - Math.max(ult, +ss.get('mel-ult') || 0);
      if (parado >= lim) { sairPor('inatividade'); return; }
      if (parado >= lim - AVISO_SEG * 1000) mostrarAviso(Math.ceil((lim - parado) / 1000)); else esconderAviso(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, atividade, { passive: true, capture: true }));
    let mv = 0; document.addEventListener('mousemove', () => { const t = Date.now(); if (t - mv > 2000) { mv = t; atividade(); } }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checar(); });
    setInterval(checar, 1000); }
  const pronto = new Promise(r => { const un = auth.onAuthStateChanged(async u => { un(); await persistir;
    if (u) {
      // sessão que não foi aberta nesta janela (ex.: login antigo guardado no computador): pede para entrar de novo
      if (ss.get('mel-sessao') !== '1') { await sairPor('sessao'); return; }
      const ultSalvo = +ss.get('mel-ult') || 0;
      if (ultSalvo && Date.now() - ultSalvo >= INATIVO_MIN * 60000) { await sairPor('inatividade'); return; }
      ult = Date.now(); ss.set('mel-ult', String(ult)); vigiar(); }
    r(u); }); });
  let acesso = { membros: {} }, acessoLido = false;
  const ehDono = u => !!u && !!u.email && u.email.toLowerCase() === DONO && u.emailVerified;
  function lerAcesso(){ return new Promise(r => {
    let feito = false; const fim = () => { if (!feito) { feito = true; acessoLido = true; r(acesso); } };
    fs.doc('config/acessos').onSnapshot(s => { acesso = (s.exists && s.data()) || { membros: {} }; fim(); }, () => fim());
    setTimeout(fim, 8000); }); }
  const papel = u => { const m = acesso.membros && acesso.membros[u.uid]; return m ? m.papel : null; };
  function userApi(u){ return {
    id: async () => u.uid,
    isOwner: async () => ehDono(u),
    canEdit: async () => { if (!acessoLido) await lerAcesso(); return ehDono(u) || papel(u) === 'socio'; },
    can: async (k) => { if (!acessoLido) await lerAcesso(); return (ehDono(u) || !!papel(u)) ? true : null; },
    me: async () => ({ id: u.uid, name: u.displayName || (u.email || '').split('@')[0], email: u.email || null, isMe: true }),
    profiles: async (ids) => { const o = {}; for (const id of ids || []) { const m = acesso.membros && acesso.membros[id];
      o[id] = { id, name: id === u.uid ? (u.displayName || (m && m.nome) || '') : ((m && m.nome) || ''), avatarUrl: '', isMe: id === u.uid }; } return o; },
    search: async (q) => { q = String(q || '').toLowerCase(); return Object.entries(acesso.membros || {})
      .filter(([id, m]) => !q || String(m.nome || '').toLowerCase().includes(q)).slice(0, 20)
      .map(([id, m]) => ({ id, name: m.nome || '', avatarUrl: '' })); }
  }; }
  const assetsApi = {
    upload: async (blob) => { const txt = await blob.text(); if (txt.length > 900000) { const e = new Error('grande'); e.code = 'quota_exceeded'; throw e; }
      const ref = fs.collection('arquivos').doc(); await ref.set({ b64: txt, em: new Date().toISOString(), por: auth.currentUser ? auth.currentUser.uid : null });
      return { id: ref.id, url: '', sizeBytes: txt.length, contentType: 'text/plain' }; },
    ler: async (id) => { const s = await fs.collection('arquivos').doc(id).get(); if (!s.exists) throw new Error('asset'); return s.data().b64; },
    delete: async (id) => { await fs.collection('arquivos').doc(id).delete(); },
    list: async () => ({ assets: [], usage: {} })
  };
  const downloadsApi = { save: async ({ filename, data }) => {
    const b = data instanceof Blob ? data : new Blob([data]); const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = filename || 'arquivo'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000); } };
  window.claude = { use: async (nome) => { const u = await pronto; if (!u) return null;
    if (nome === 'db') return fs;
    if (nome === 'user') { if (!acessoLido) await lerAcesso(); return userApi(u); }
    if (nome === 'assets') return assetsApi;
    if (nome === 'downloads') return downloadsApi;
    return null; } };

  /* ---------- entrar, criar conta, sair ---------- */
  const ERROS = {
    'auth/invalid-email': 'E-mail inválido.', 'auth/missing-password': 'Informe a senha.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci minha senha".',
    'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de concluir.', 'auth/network-request-failed': 'Sem conexão. Verifique a internet.',
    'auth/unauthorized-domain': 'Este endereço ainda não foi autorizado no Firebase (Authentication > Configurações > Domínios autorizados).'
  };
  const msgErro = e => ERROS[e && e.code] || 'Não foi possível concluir agora. Tente de novo.';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let aba = 'entrar';
  window.melSair = async () => { ss.del('mel-sessao'); ss.del('mel-ult'); try { await auth.signOut(); } catch (e) {} location.reload(); };
  window.melLogin = {
    html(){ const ufs = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SE SP TO'.split(' ');
      const nota = motivoSaida === 'inatividade' ? 'Você saiu automaticamente depois de ' + INATIVO_MIN + ' minutos sem uso. Entre de novo para continuar.'
        : motivoSaida === 'sessao' ? 'Por segurança, a Mel agora pede o login a cada vez que o navegador é aberto. Entre de novo para continuar.' : '';
      return `<h2>${aba === 'entrar' ? 'Entrar na Mel' : 'Criar conta'}</h2>
      ${nota && aba === 'entrar' ? `<p class="gnota" role="status" style="margin:0 0 14px;padding:10px 12px;border-radius:12px;background:#FFF6D6;color:#5C4500;font-size:13.5px;line-height:1.4">${esc(nota)}</p>` : ''}
      <div class="gtabs" role="tablist"><button type="button" role="tab" aria-selected="${aba === 'entrar'}" data-ml="entrar">Entrar</button><button type="button" role="tab" aria-selected="${aba === 'criar'}" data-ml="criar">Pedir cadastro</button></div>
      ${aba === 'entrar' ? `<form class="gfields" id="mlForm" novalidate>
        <label class="gf"><span>E-mail</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="gf"><span>Senha</span><input name="senha" type="password" autocomplete="current-password" required></label>
        <p class="gerr" id="mlErr" role="alert"></p>
        <button class="gbtn" type="submit">Entrar</button>
        <button class="glink" type="button" data-ml="reset">Esqueci minha senha</button>
        <p class="gsub" style="margin:4px 0 0;font-size:12.5px">Por segurança, a sessão termina quando o navegador é fechado ou após ${INATIVO_MIN} minutos sem uso.</p></form>`
      : `<p class="gsub">Crie a sua conta. O acesso aos dados é liberado depois da aprovação do escritório.</p>
        <form class="gfields" id="mlForm" novalidate>
        <label class="gf"><span>Nome completo</span><input name="nome" autocomplete="name" required></label>
        <label class="gf"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="gf"><span>Senha (mínimo 8 caracteres)</span><input name="senha" type="password" autocomplete="new-password" minlength="8" required></label>
        <div class="grow"><label class="gf"><span>OAB</span><input name="oab" inputmode="numeric" placeholder="Número"></label><label class="gf guf"><span>UF</span><select name="uf">${ufs.map(u => `<option ${u === 'AL' ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div>
        <label class="gf"><span>Celular ou WhatsApp</span><input name="telefone" inputmode="tel" autocomplete="tel" placeholder="(82) 90000-0000"></label>
        <p class="gerr" id="mlErr" role="alert"></p>
        <button class="gbtn" type="submit">Criar conta e pedir acesso</button></form>`}
      <div class="gou"><span>ou</span></div>
      <button class="gbtn ghost ggoogle" type="button" data-ml="google"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>Continuar com Google</button>`; },
    wire(){ const box = document.querySelector('#gate .gform'); if (!box) return;
      box.querySelectorAll('[data-ml]').forEach(b => b.addEventListener('click', async () => { const k = b.dataset.ml;
        if (k === 'entrar' || k === 'criar') { aba = k; window.melLogin.rerender(); return; }
        const err = document.getElementById('mlErr');
        if (k === 'google') { try { await persistir; await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); marcarEntrada(); location.reload(); } catch (e) { if (err) err.textContent = msgErro(e); } return; }
        if (k === 'reset') { const em = box.querySelector('input[name=email]').value.trim(); if (!em) { err.textContent = 'Digite o seu e-mail acima e toque de novo em "Esqueci minha senha".'; return; }
          try { await auth.sendPasswordResetEmail(em); err.style.color = 'var(--c-ok)'; err.textContent = 'Se houver conta com este e-mail, enviamos um link para criar uma nova senha.'; } catch (e) { err.textContent = msgErro(e); } } }));
      const f = document.getElementById('mlForm'); if (!f) return;
      f.addEventListener('submit', async ev => { ev.preventDefault(); const d = Object.fromEntries(new FormData(f).entries()); const err = document.getElementById('mlErr'); const btn = f.querySelector('button[type=submit]'); err.style.color = ''; err.textContent = '';
        try { btn.disabled = true;
          await persistir;
          if (aba === 'entrar') { await auth.signInWithEmailAndPassword(String(d.email).trim(), d.senha); marcarEntrada(); location.reload(); return; }
          if (!d.nome || d.nome.trim().length < 5) throw { code: 'mel/nome' };
          if (String(d.senha || '').length < 8) throw { code: 'auth/weak-password' };
          const tel = String(d.telefone || '').replace(/\D/g, ''); if (tel.length < 10) throw { code: 'mel/tel' };
          const c = await auth.createUserWithEmailAndPassword(String(d.email).trim(), d.senha); marcarEntrada();
          await c.user.updateProfile({ displayName: d.nome.trim() });
          try { await c.user.sendEmailVerification(); } catch (e) {}
          await fs.doc('acessos/' + c.user.uid).set({ nome: d.nome.trim(), oab: String(d.oab || '').replace(/\D/g, ''), uf: d.uf, telefone: String(d.telefone).trim(), mensagem: '', status: 'pendente', em: new Date().toISOString(), conta: c.user.email });
          location.reload();
        } catch (e) { btn.disabled = false;
          err.textContent = e.code === 'mel/nome' ? 'Informe o seu nome completo.' : e.code === 'mel/tel' ? 'Informe um celular com DDD.' : msgErro(e); } }); },
    rerender(){ const box = document.querySelector('#gate .gform'); if (!box) return; box.innerHTML = this.html(); this.wire(); }
  };
})();
