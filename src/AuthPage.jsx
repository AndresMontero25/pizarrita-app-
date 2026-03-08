import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';
import { registerUser } from './db';
import { Layout } from 'lucide-react';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      let userCredential;
      if (mode === 'register') {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
      // Ensure the user's email is stored so others can find them for sharing
      await registerUser(userCredential.user.uid, userCredential.user.email);
    } catch (err) {
      setError(translateError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Layout size={32} />
          <span>Pizarrita App</span>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Iniciar sesión
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Crear cuenta
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Correo electrónico</label>
            <input
              type="email"
              required
              autoFocus
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label>Contraseña</label>
            <input
              type="password"
              required
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {mode === 'register' && (
            <div className="auth-field">
              <label>Confirmar contraseña</label>
              <input
                type="password"
                required
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}

          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading
              ? 'Procesando...'
              : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button className="auth-switch-btn" onClick={switchMode}>
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  );
}

function translateError(code) {
  switch (code) {
    case 'auth/email-already-in-use': return 'Este correo ya está registrado.';
    case 'auth/invalid-email': return 'El correo no es válido.';
    case 'auth/user-not-found': return 'No existe una cuenta con ese correo.';
    case 'auth/wrong-password': return 'Contraseña incorrecta.';
    case 'auth/invalid-credential': return 'Correo o contraseña incorrectos.';
    case 'auth/too-many-requests': return 'Demasiados intentos. Inténtalo más tarde.';
    case 'auth/weak-password': return 'La contraseña es muy débil.';
    default: return 'Ocurrió un error. Inténtalo de nuevo.';
  }
}
