import { useEffect, useState } from 'react';
import './App.css';
import CharacterCreation from './features/characterCreation/CharacterCreation';
import Lobby from './features/lobby/Lobby';
import ProfessionSelect from './features/professionSelect/ProfessionSelect';
import { readCharacter, fetchCharacterFromServer } from './features/characterCreation/character';
import AuthOverlay from './features/auth/AuthOverlay';
import { clearToken, getToken } from './api';
import { CREATION_JOBS, type CreationJob } from './features/characterCreation/assets';

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
  if (inLobby && character) return <Lobby character={character} onExit={() => {
    setInLobby(false);
    setStarted(false);
    history.pushState(null, '', import.meta.env.BASE_URL);
  }} onQuit={quit} />;
  if (started || inLobby) return <CharacterCreation key={jobId} jobId={jobId} onComplete={created => {
    setCharacter(created);
    setStarted(false);
    resume();
  }} onBack={() => {
    setStarted(false);
    setInLobby(false);
    history.pushState(null, '', `${import.meta.env.BASE_URL}?job=${jobId}`);
  }} />;

  return <ProfessionSelect jobId={jobId} onChoose={setJobId} onCreate={() => {
    setStarted(true);
    history.pushState(null, '', `${import.meta.env.BASE_URL}create-character?job=${jobId}`);
  }} onBack={character ? resume : quit} onQuit={quit} onResume={character ? resume : undefined} />;
}

export default App;
