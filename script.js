// script.js — Login Firebase (email + password) — versión enterprise y robusta
(() => {
  // ===== Config =====
  const REDIRECT_AFTER_LOGIN = 'menu.html';

  // ===== Selectores / UI =====
  const $ = (s) => document.querySelector(s);
  const overlay   = $('#overlay');
  const errorBox  = $('#errorBox');
  const okBox     = $('#successBox');
  const toastBox  = $('#toast');

  const setAlert = (el, msg) => {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('show', !!msg);
  };
  const showErr = (msg='') => { setAlert(errorBox, msg); if (msg) toast(msg, 'err'); };
  const showOk  = (msg='') => { setAlert(okBox, msg);   if (msg) toast(msg, 'ok');  };

  const showOverlay = (v=true) => {
    if (!overlay) return;
    overlay.classList.toggle('show', v);
    overlay.setAttribute('aria-hidden', v ? 'false' : 'true');
  };

  const toast = (msg, type='ok') => {
    if (!toastBox || !msg) return;
    const t = document.createElement('div');
    t.className = 't ' + (type === 'err' ? 'err' : 'ok');
    t.role = 'status';
    t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(4px)'; }, 2200);
    setTimeout(()=> t.remove(), 2800);
  };

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // ===== Verificación de SDK / Config =====
  if (typeof firebase === 'undefined') {
    showErr('No se cargó el SDK de Firebase. Asegúrate de incluir firebase-app-compat.js y firebase-auth-compat.js antes de script.js.');
    console.error('[login] Firebase SDK no detectado');
    return;
  }
  if (!window.firebaseConfig || typeof window.firebaseConfig !== 'object') {
    showErr('Falta la configuración de Firebase (firebase-config.js).');
    console.error('[login] Falta window.firebaseConfig');
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  } catch (e) {
    showErr('No se pudo inicializar Firebase.');
    console.error('[login] init error', e);
    return;
  }

  const auth = firebase.auth();

  // ===== DOM (acepta tus nombres de ID habituales) =====
  // Soporta #idOrEmail o #email / #loginBtn o #btnLogin
  const emailEl    = $('#idOrEmail') || $('#email');
  const pwdEl      = $('#password');
  const rememberEl = $('#remember');
  const loginBtn   = $('#loginBtn') || $('#btnLogin');
  const resetLink  = $('#resetPwdLink');
  const togglePwd  = $('#togglePwd');
  const capsHint   = $('#capsHint');
  const form       = $('#loginForm');

  // Prefill del último email usado
  try {
    const last = localStorage.getItem('sp_last_email');
    if (emailEl && last && !emailEl.value) emailEl.value = last;
  } catch {}

  // Estado ocupado (deshabilita inputs y muestra spinner en botón)
  const setBusy = (busy) => {
    const inputs = [emailEl, pwdEl, rememberEl].filter(Boolean);
    inputs.forEach(el => el.disabled = !!busy);
    if (loginBtn) {
      loginBtn.disabled = !!busy;
      loginBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
      loginBtn.dataset.label ??= loginBtn.textContent.trim();
      loginBtn.innerHTML = busy
        ? `<span class="spinner" aria-hidden="true"></span> Ingresando…`
        : loginBtn.dataset.label;
    }
  };

  // ===== Acciones =====
  let logging = false;

  async function doLogin() {
    if (logging) return;
    const rawEmail = (emailEl?.value || '').trim();
    const email = rawEmail.toLowerCase();
    const password = (pwdEl?.value || '');

    showErr(''); showOk('');

    if (!email || !password) {
      showErr('Completa usuario y contraseña.');
      emailEl?.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showErr('Email inválido.');
      emailEl?.focus();
      return;
    }

    logging = true;
    setBusy(true);
    showOverlay(true);

    try {
      await auth.setPersistence(rememberEl?.checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION);

      await auth.signInWithEmailAndPassword(email, password);

      try { localStorage.setItem('sp_last_email', email); } catch {}

      showOk('¡Bienvenido!');
      
      // Animación de salida tipo Figma
      const authWrap = $('#auth-wrap') || document.querySelector('.auth-wrap');
      if (authWrap) {
        authWrap.style.animation = 'slideOutUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
      }
      
      // Fade out del fondo
      const body = document.body;
      body.style.transition = 'opacity 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      setTimeout(() => {
        body.style.opacity = '0';
      }, 100);
      
      setTimeout(()=> location.replace(REDIRECT_AFTER_LOGIN), 600);
    } catch (err) {
      console.error('[login] error', err);
      const map = {
        'auth/invalid-email':     'Email inválido.',
        'auth/user-disabled':     'Usuario deshabilitado.',
        'auth/user-not-found':    'Usuario no encontrado.',
        'auth/wrong-password':    'Contraseña incorrecta.',
        'auth/too-many-requests': 'Demasiados intentos, inténtalo más tarde.',
        'auth/network-request-failed': 'Sin conexión o red inestable.',
      };
      showErr(map[err.code] || 'No se pudo iniciar sesión.');
      if (pwdEl) { pwdEl.value = ''; pwdEl.focus(); }
    } finally {
      logging = false;
      setBusy(false);
      showOverlay(false);
    }
  }

  async function doReset() {
    const email = (emailEl?.value || '').trim().toLowerCase();
    showErr(''); showOk('');

    if (!email) { showErr('Ingresa tu email para recuperar.'); emailEl?.focus(); return; }
    if (!isValidEmail(email)) { showErr('Email inválido.'); emailEl?.focus(); return; }

    setBusy(true); showOverlay(true);
    try {
      await auth.sendPasswordResetEmail(email);
      showOk('Enviamos un correo para restablecer tu contraseña.');
      try { localStorage.setItem('sp_last_email', email); } catch {}
    } catch (err) {
      console.error('[reset] error', err);
      const map = {
        'auth/invalid-email':  'Email inválido.',
        'auth/user-not-found': 'No existe una cuenta con ese correo.',
        'auth/network-request-failed': 'Sin conexión o red inestable.',
      };
      showErr(map[err.code] || 'No se pudo enviar el correo de recuperación.');
    } finally {
      setBusy(false); showOverlay(false);
    }
  }

  // ===== Eventos =====
  form?.addEventListener('submit', (e)=>{ e.preventDefault(); doLogin(); });
  loginBtn?.addEventListener('click', (e)=>{ e.preventDefault(); doLogin(); });

  emailEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); pwdEl?.focus(); }
  });

  pwdEl?.addEventListener('keydown', (e) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      if (capsHint) capsHint.textContent = 'Bloq Mayús activado';
    } else {
      if (capsHint) capsHint.textContent = '';
    }
    if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
  });

  togglePwd?.addEventListener('click', () => {
    if (!pwdEl) return;
    const t = pwdEl.getAttribute('type') === 'password' ? 'text' : 'password';
    pwdEl.setAttribute('type', t);
    togglePwd.textContent = t === 'password' ? '👁️' : '🙈';
    togglePwd.setAttribute('aria-label', t === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
    pwdEl.focus();
  });

  resetLink?.addEventListener('click', (e) => { e.preventDefault(); doReset(); });

  // Redirección si ya hay sesión
  auth.onAuthStateChanged((user) => { if (user) location.replace(REDIRECT_AFTER_LOGIN); });

  // Conectividad
  let wasOnline = navigator.onLine;
  const net = (ok) => { if (ok === wasOnline) return; wasOnline = ok; toast(ok ? 'Conexión restaurada' : 'Sin conexión', ok ? 'ok' : 'err'); };
  window.addEventListener('online',  () => net(true));
  window.addEventListener('offline', () => net(false));

  // Foco inicial
  if (emailEl && !emailEl.value) emailEl.focus(); else pwdEl?.focus();
})();
