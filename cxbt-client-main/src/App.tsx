import { lazy, Suspense, useEffect, useState } from 'react';
import './App.css';
import ProfessionSelect from './features/professionSelect/ProfessionSelect';
import { readCharacter, fetchCharacterFromServer } from './features/characterCreation/character';
import AuthOverlay from './features/auth/AuthOverlay';
import { clearToken, getToken } from './api';
import { CREATION_JOBS, type CreationJob } from './features/characterCreation/assets';

// 路由级代码按需懒加载，避免在登录界面或职业选择阶段提前解析大厅与三维捏脸模块
const CharacterCreation = lazy(() => import('./features/characterCreation/CharacterCreation'));
const Lobby = lazy(() => import('./features/lobby/Lobby'));

const selectedJob = (): CreationJob => {
  const id = new URLSearchParams(location.search).get('job');
  return id && id in CREATION_JOBS ? id as CreationJob : 'guardian';
};

function App() {
  const [jobId, setJobId] = useState(selectedJob);
  const [started, setStarted] = useState(() => location.pathname.endsWith('/create-character') || new URLSearchParams(location.search).get('screen') === 'creation');
  const [inLobby, setInLobby] = useState(() => location.pathname.endsWith('/lobby'));
  const [character, setCharacter] = useState(readCharacter);
  const [isAuth, setIsAuth] = useState(!!getToken());

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;
    void fetchCharacterFromServer().then(saved => {
      if (!saved || cancelled) return;
      setCharacter(saved);
      setInLobby(true);
    });
    return () => { cancelled = true; };
  }, [isAuth]);
  useEffect(() => {
    const navigate = () => {
      setJobId(selectedJob());
      setInLobby(location.pathname.endsWith('/lobby'));
      setCharacter(readCharacter());
      setStarted(location.pathname.endsWith('/create-character') || new URLSearchParams(location.search).get('screen') === 'creation');
    };
    addEventListener('popstate', navigate);
    return () => removeEventListener('popstate', navigate);
  }, []);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      // 唯一保留的浏览器快捷键：F11 全屏切换
      if (event.code === 'F11' || event.key === 'F11') {
        return;
      }

      const isInputTarget =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement;

      const isFunctionKey = /^F([1-9]|10|12)$/.test(event.code) || /^F([1-9]|10|12)$/.test(event.key);
      const isBrowserNavKey =
        event.key === 'BrowserBack' ||
        event.key === 'BrowserForward' ||
        event.key === 'BrowserRefresh' ||
        event.key === 'BrowserStop' ||
        event.key === 'BrowserSearch' ||
        event.key === 'BrowserFavorites' ||
        event.key === 'BrowserHome' ||
        event.key === 'ContextMenu';

      if (isFunctionKey || isBrowserNavKey || event.altKey || event.metaKey) {
        event.preventDefault();
        return;
      }

      if (event.ctrlKey) {
        // 输入框内仅放行复制/粘贴/全选/剪切，其余 Ctrl+W/R/T/N/S/D/F/P/U/H/J 等全部屏蔽
        const allowedInInput = isInputTarget && ['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ'].includes(event.code);
        if (!allowedInInput) {
          event.preventDefault();
        }
        return;
      }

      if (!isInputTarget && (event.code === 'Tab' || event.code === 'Backspace')) {
        event.preventDefault();
      }
    };

    const onFullscreenChange = () => {
      const nav = navigator as any;
      if (document.fullscreenElement && nav.keyboard?.lock) {
        nav.keyboard.lock().catch(() => {});
      } else if (!document.fullscreenElement && nav.keyboard?.unlock) {
        nav.keyboard.unlock();
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown, { capture: true });
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onGlobalKeyDown, { capture: true });
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const quit = () => {
    clearToken();
    setIsAuth(false);
    setInLobby(false);
    setStarted(false);
    history.pushState(null, '', import.meta.env.BASE_URL);
  };
  const resume = () => {
    setInLobby(true);
    history.pushState(null, '', `${import.meta.env.BASE_URL}lobby`);
  };

  if (!isAuth) return <AuthOverlay onLogin={() => setIsAuth(true)} />;
  if (inLobby && character) return (
    <Suspense fallback={<main className="lobby-viewport"><p role="status">Loading lobby...</p></main>}>
      <Lobby character={character} onExit={() => {
        setInLobby(false);
        setStarted(false);
        history.pushState(null, '', import.meta.env.BASE_URL);
      }} onQuit={quit} />
    </Suspense>
  );
  if (started || inLobby) return (
    <Suspense fallback={<main className="lobby-viewport"><p role="status">Loading character creation...</p></main>}>
      <CharacterCreation key={jobId} jobId={jobId} onComplete={created => {
        setCharacter(created);
        setStarted(false);
        resume();
      }} onBack={() => {
        setStarted(false);
        setInLobby(false);
        history.pushState(null, '', `${import.meta.env.BASE_URL}?job=${jobId}`);
      }} />
    </Suspense>
  );

  return <ProfessionSelect jobId={jobId} onChoose={setJobId} onCreate={() => {
    setStarted(true);
    history.pushState(null, '', `${import.meta.env.BASE_URL}create-character?job=${jobId}`);
  }} onBack={character ? resume : quit} onQuit={quit} onResume={character ? resume : undefined} />;
}

export default App;
