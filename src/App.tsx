import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { SharePage } from './components/SharePage';

type Session = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; email: string };

export function App() {
  const shareToken = location.pathname.match(/^\/s\/([\w-]+)\/?$/)?.[1];
  if (shareToken) return <SharePage token={shareToken} />;
  return <PrivateApp />;
}

function PrivateApp() {
  const [session, setSession] = useState<Session>({ status: 'loading' });

  useEffect(() => {
    api
      .me()
      .then(({ email }) => setSession({ status: 'signed-in', email }))
      .catch(() => setSession({ status: 'signed-out' }));
  }, []);

  const signOut = useCallback(() => {
    api.logout().catch(() => undefined);
    setSession({ status: 'signed-out' });
  }, []);

  if (session.status === 'loading') return <div className="splash" aria-busy="true" />;
  if (session.status === 'signed-out') {
    return <Login onSignedIn={(email) => setSession({ status: 'signed-in', email })} />;
  }
  return <Dashboard email={session.email} onSignOut={signOut} />;
}
