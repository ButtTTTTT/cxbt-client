import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CreationJob } from '../characterCreation/assets';
import SettingsMenu from '../lobby/SettingsMenu';
import './ProfessionSelect.css';

type ProfessionAssets = {
  ui: Record<string, string>;
  jobs: Record<CreationJob, { background: string; portrait: string; button: string; banner: string; icon: string }>;
};
const BASE = `${import.meta.env.BASE_URL}assets/profession/`;
const url = (path: string) => BASE + path;
const PROFESSIONS: { id: CreationJob; name: string; english: string; stats: number[]; description: string; color: string }[] = [
  { id: 'guardian', name: '医护兵', english: 'Guardian', stats: [5, 3, 2, 5], color: '#4fe3f7',
    description: '●"医护兵"视救助生命、捍卫和平为天职。\n●步枪、散弹枪、复合弓，轻量便捷，适合移动作战。\n●"群体治疗技能"和"辅助攻击技能"将提升团队的整体作战能力。' },
  { id: 'assassin', name: '突击兵', english: 'Assassin', stats: [4, 5, 3, 2], color: '#c088f6',
    description: '●"突击兵"总是如幽灵般潜伏或游走。寻找时机，迅速偷走敌人的生命。\n●近身短刀突袭，远程精准狙击。极端的作战距离让他成为战斗中的孤胆英雄。' },
  { id: 'gunner', name: '重装兵', english: 'Gunner', stats: [3, 2, 5, 3], color: '#dfd6ae',
    description: '●"重装兵"是强壮、无畏的勇士，掩护同伴、冲锋在前是他们的使命。\n●机关枪、火箭筒，火力强悍极具侵略性。\n●盾牌配合防御性技能，造就了以守为攻的职业打法。' },
  { id: 'biochemist', name: '生化兵', english: 'Biochemist', stats: [2, 4, 2, 4], color: '#d78b97',
    description: '●"生化兵"善用生化武器，擅长控制战场。\n●生化喷射器、榴弹发射器，适合区域压制。\n●治疗和毒素技能为团队提供支援。' },
];
const STAT_LABELS = ['难易度', '攻击', '防御', '生存'];

export default function ProfessionSelect({ jobId, onChoose, onCreate, onBack, onQuit, onResume }: {
  jobId: CreationJob;
  onChoose: (job: CreationJob) => void;
  onCreate: () => void;
  onBack: () => void;
  onQuit: () => void;
  onResume?: () => void;
}) {
  const [assets, setAssets] = useState<ProfessionAssets>();
  const [error, setError] = useState('');
  const [scale, setScale] = useState(() => Math.min(innerWidth / 1200, innerHeight / 900));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [motion, setMotion] = useState(true);
  const [volume, setVolume] = useState(1);
  const [effectsVolume, setEffectsVolume] = useState(1);
  const musicRef = useRef<HTMLAudioElement>(null);
  const changeRef = useRef<HTMLAudioElement>(null);
  const profession = PROFESSIONS.find(job => job.id === jobId) ?? PROFESSIONS[0];

  useEffect(() => {
    const controller = new AbortController();
    void fetch(url('catalog.json'), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('職業素材載入失敗');
      const catalog: ProfessionAssets = await response.json();
      if (!controller.signal.aborted) setAssets(catalog);
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / 1200, innerHeight / 900));
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const audio = musicRef.current;
    if (audio) {
      audio.volume = volume;
      void audio.play().catch(() => undefined);
    }
    if (changeRef.current) changeRef.current.volume = effectsVolume;
    const unlockAudio = () => {
      if (musicRef.current && musicRef.current.paused && volume > 0) {
        void musicRef.current.play().catch(() => undefined);
      }
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [assets, volume, effectsVolume]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !settingsOpen) { event.preventDefault(); setSettingsOpen(true); }
    };
    addEventListener('keydown', keydown);
    return () => removeEventListener('keydown', keydown);
  }, [settingsOpen]);

  if (!assets) return <main className="profession-viewport"><p role="status">{error || '職業載入中…'}</p></main>;
  const art = (key: string): CSSProperties => ({ backgroundImage: `url("${url(assets.ui[key])}")` });
  const buttonArt = (key: string): CSSProperties => ({
    '--art': `url("${url(assets.ui[key + '_normal'])}")`,
    '--hover-art': `url("${url(assets.ui[key + '_hover'])}")`,
    '--down-art': `url("${url(assets.ui[key + '_down'])}")`,
  } as CSSProperties);
  const selected = assets.jobs[profession.id];
  const menuAssets = { ui: Object.fromEntries(Object.entries(assets.ui).map(([key, path]) => [key, '../profession/' + path])) };
  const choose = (id: CreationJob) => {
    if (id === jobId) return;
    if (changeRef.current) {
      changeRef.current.currentTime = 0;
      void changeRef.current.play().catch(() => undefined);
    }
    onChoose(id);
  };

  return <main className="profession-viewport">
    <div className={`profession-screen${motion ? '' : ' profession-still'}`} data-profession-ready="true" data-job={profession.id}
      style={{ transform: `scale(${scale})`, backgroundImage: `url("${url(selected.background)}")` }}
      onPointerDown={() => { void musicRef.current?.play().catch(() => undefined); }}>
      <audio ref={musicRef} src={`${import.meta.env.BASE_URL}assets/character-selection.ogg`} loop preload="auto" aria-label="職業選擇背景音樂" />
      <audio ref={changeRef} src={url('char-change.wav')} preload="auto" aria-label="切換職業音效" />
      <div className="profession-sparkles" aria-hidden="true">
        {Array.from({ length: 42 }, (_, index) => <img key={index} src={url(assets.ui.sparkle)} alt=""
          style={{ left: 30 + index * 137 % 1130, top: 70 + index * 211 % 740, width: 5 + index % 4 * 3,
            '--sparkle-opacity': 0.12 + index % 5 * 0.045, animationDelay: `${-index * 0.37}s`, animationDuration: `${3 + index % 4}s` } as CSSProperties} />)}
      </div>
      <img className="profession-frame" src={url(assets.ui.frame)} alt="" draggable={false} />
      <h1 className="profession-title" style={art('title')}>職業選擇</h1>

      <div className="profession-presentation" key={profession.id}>
        <img className="profession-banner" src={url(selected.banner)} alt={profession.english} draggable={false} />
        <img className="profession-portrait" src={url(selected.portrait)} alt={profession.name} draggable={false} />
        <aside className="profession-intro" aria-label={`${profession.name}職業介紹`}>
          <div className="profession-job-pill" style={art('jobPill')}>
            <img src={url(selected.icon)} alt="" /><span>{profession.name}</span>
          </div>
          <div className="profession-description" style={art('description')}><p>{profession.description}</p></div>
          <div className="profession-stats">
            {STAT_LABELS.map((label, index) => <div key={label} className="profession-stat" style={art('statPill')}>
              <span>{label}</span><div aria-label={`${label} ${profession.stats[index]}/5`}>
                {Array.from({ length: 5 }, (_, diamond) => <img key={diamond} src={url(assets.ui[diamond < profession.stats[index] ? 'diamondOn' : 'diamondOff'])} alt="" />)}
              </div>
            </div>)}
          </div>
        </aside>
      </div>

      <nav className="profession-choices" aria-label="職業選擇">
        {PROFESSIONS.map((job, index) => <button key={job.id} type="button" className={`profession-choice${profession.id === job.id ? ' selected' : ''}`}
          data-job={job.id} aria-label={job.name} aria-pressed={profession.id === job.id}
          style={{ top: 82 + index * 180, '--job-color': job.color } as CSSProperties} onClick={() => choose(job.id)}>
          <img src={url(assets.jobs[job.id].button)} alt="" draggable={false} />
        </button>)}
      </nav>
      <button className="profession-action profession-back" style={buttonArt('button')} onClick={onBack}>
        <img src={url(assets.ui.back)} alt="" /><span>返回</span>
      </button>
      {onResume && <button className="profession-action resume-lobby" type="button" onClick={onResume} style={{ position: 'absolute', top: 20, right: 20 }}>返回大厅</button>}
      <button className="profession-action profession-create" style={buttonArt('create')} onClick={onCreate}>开始创建</button>
      <button className="profession-action profession-settings" style={buttonArt('button')} onClick={() => setSettingsOpen(true)}>
        <img src={url(assets.ui.settings)} alt="" /><span>设置</span>
      </button>

      {settingsOpen && <SettingsMenu assets={menuAssets} volume={volume} effectsVolume={effectsVolume} motion={motion}
        onVolume={setVolume} onEffectsVolume={setEffectsVolume} onMotion={setMotion} onClose={() => setSettingsOpen(false)}
        onExit={onBack} onQuit={onQuit} />}
    </div>
  </main>;
}
