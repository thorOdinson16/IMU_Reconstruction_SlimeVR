import { type ModuleRegistry } from '../modules/registry';
import type { AppState, AppStore, NavigationId } from '../state/app-state';
import { icon, type IconName } from './icons';
import { AvatarRuntime } from './avatar-runtime';
import { YogaModule } from '../modules/yoga/yoga-module';
import { YogaStudio } from './yoga-studio';
import { PhysiotherapyModule } from '../modules/physiotherapy/physiotherapy-module';
import { PhysiotherapyStudio } from './physiotherapy-studio';
import { ProfileEditor } from './profile-editor';
import { SessionBrowser } from './session-browser';
import { ProgressDashboard } from './progress-dashboard';
import { BiomechanicsLab } from './biomechanics-lab';
import { SessionRecorder } from '../platform/recording';
import { hasAnyProfiles, getActiveProfile } from '../platform';

interface NavItem { id: NavigationId; label: string; icon: IconName; }

const navigation: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'yoga', label: 'Yoga', icon: 'yoga' },
  { id: 'physiotherapy', label: 'Physiotherapy', icon: 'physio' },
  { id: 'biomechanics', label: 'Biomechanics Lab', icon: 'lab' },
  { id: 'sports', label: 'Sports', icon: 'sports' },
  { id: 'gym', label: 'Gym', icon: 'gym' },
  { id: 'posture', label: 'Posture', icon: 'posture' },
  { id: 'sessions', label: 'Sessions', icon: 'sessions' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const pageCopy: Record<Exclude<NavigationId, 'dashboard'>, { eyebrow: string; title: string; text: string; icon: IconName }> = {
  yoga: { eyebrow: 'Movement practice', title: 'Yoga Studio', text: 'A calm, focused workspace is ready for guided pose programs and live movement sessions.', icon: 'yoga' },
  physiotherapy: { eyebrow: 'Clinical workspace', title: 'Physiotherapy', text: 'A protected framework for future care pathways, session workflows, and objective movement capture.', icon: 'physio' },
  biomechanics: { eyebrow: 'Analysis workspace', title: 'Biomechanics Lab', text: 'Frame-by-frame motion replay, side-by-side comparison, and detailed biomechanical inspection.', icon: 'lab' },
  sports: { eyebrow: 'Performance system', title: 'Sports Lab', text: 'A high-performance workspace ready to organize sport-specific motion sessions, beginning with cricket.', icon: 'sports' },
  gym: { eyebrow: 'Training workspace', title: 'Gym Form', text: 'A focused training environment ready for exercise workflows and movement capture.', icon: 'gym' },
  posture: { eyebrow: 'Daily movement', title: 'Posture', text: 'A quiet, continuous observation workspace ready for posture sessions and future alignment insights.', icon: 'posture' },
  sessions: { eyebrow: 'Session library', title: 'Sessions', text: 'Your future recordings, protocol metadata, and movement replays will be organized here.', icon: 'sessions' },
  analytics: { eyebrow: 'Performance intelligence', title: 'Analytics', text: 'This workspace is reserved for future trends and longitudinal movement summaries.', icon: 'analytics' },
  reports: { eyebrow: 'Clear communication', title: 'Reports', text: 'This workspace is reserved for future shareable session and progress reports.', icon: 'reports' },
  settings: { eyebrow: 'Application controls', title: 'Settings', text: 'Connection preferences, interface behavior, and future workspace configuration will live here.', icon: 'settings' },
};

function statusLabel(state: AppState): string {
  if (state.connection === 'connected' && state.latestPose?.trackedBodyParts) return 'Skeleton stream active';
  if (state.connection === 'connected') return 'Connected · awaiting bones';
  if (state.connection === 'connecting') return 'Connecting to engine';
  return 'Engine disconnected';
}

function diagnosticValue(value: number | null | undefined, suffix: string): string {
  return value == null ? '—' : `${value.toFixed(1)}${suffix}`;
}

export class AppShell {
  private readonly root: HTMLElement;
  private stopListening: (() => void) | null = null;
  private yogaStudio: YogaStudio | null = null;
  private physioStudio: PhysiotherapyStudio | null = null;
  private profileEditor: ProfileEditor | null = null;
  private sessionBrowser: SessionBrowser | null = null;
  private progressDashboard: ProgressDashboard | null = null;
  private biomechanicsLab: BiomechanicsLab | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly modules: ModuleRegistry,
    private readonly avatar: AvatarRuntime,
    private readonly yoga: YogaModule,
    private readonly physio: PhysiotherapyModule,
    private readonly recorder: SessionRecorder,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'app-shell';
    this.root.innerHTML = `
      <aside class="sidebar glass-panel">
        <div class="brand"><div class="brand-mark">B</div><div class="brand-copy"><strong>BMDT</strong><span>Motion intelligence</span></div></div>
        <nav class="navigation" aria-label="Primary navigation"></nav>
        <div class="sidebar-footer"><button class="collapse-button" data-action="collapse">${icon('collapse')}<span>Collapse sidebar</span></button><div class="sidebar-user" data-action="settings"><div class="user-avatar" data-user-avatar>?</div><div><strong data-user-name>No profile</strong><span data-user-sub>Click to manage</span></div></div></div>
      </aside>
      <main class="workspace"><header class="topbar"><div class="topbar-location"><span class="eyebrow" data-page-eyebrow>Operations center</span><h1 data-page-title>Dashboard</h1></div><div class="topbar-actions"><div class="engine-status" data-engine-status><i></i><span>Connecting to engine</span></div><button class="panel-button" data-action="context" aria-label="Toggle context panel">${icon('panel')}</button></div></header><section class="workspace-content" data-workspace-content></section></main>
      <aside class="context-panel glass-panel" data-context-panel></aside>`;
    this.renderNavigation();
    this.root.querySelector<HTMLElement>('[data-workspace-content]')!.append(this.dashboard());
    this.renderContext(this.store.snapshot);
    this.root.addEventListener('click', this.handleClick);
    this.stopListening = this.store.subscribe((state) => this.render(state));
    requestAnimationFrame(() => this.checkFirstLaunch());
  }

  private checkFirstLaunch(): void {
    if (!hasAnyProfiles()) {
      const settingsBtn = this.root.querySelector<HTMLElement>('[data-page="settings"]');
      settingsBtn?.click();
    }
  }

  mount(target: HTMLElement): void {
    target.append(this.root);
    this.avatar.start();
  }

  destroy(): void { this.stopListening?.(); this.avatar.stop(); this.root.remove(); }

  private renderNavigation(): void {
    const nav = this.root.querySelector<HTMLElement>('.navigation')!;
    nav.innerHTML = navigation.map((item, index) => `${index === 7 ? '<span class="nav-divider"></span>' : ''}<button class="nav-item" data-page="${item.id}" title="${item.label}">${icon(item.icon)}<span>${item.label}</span></button>`).join('');
  }

  private render(state: AppState): void {
    this.root.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    this.root.classList.toggle('context-closed', !state.contextOpen);
    this.root.querySelectorAll<HTMLElement>('[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === state.activePage));
    this.root.querySelector<HTMLElement>('[data-page-title]')!.textContent = state.activePage === 'dashboard' ? 'Dashboard' : pageCopy[state.activePage].title;
    this.root.querySelector<HTMLElement>('[data-page-eyebrow]')!.textContent = state.activePage === 'dashboard' ? 'Operations center' : pageCopy[state.activePage].eyebrow;
    const status = this.root.querySelector<HTMLElement>('[data-engine-status]')!;
    status.dataset.status = state.connection;
    status.querySelector('span')!.textContent = statusLabel(state);
    this.renderWorkspace(state);
    this.renderContext(state);
    this.updateSidebarUser();
  }

  private updateSidebarUser(): void {
    const user = getActiveProfile();
    const nameEl = this.root.querySelector<HTMLElement>('[data-user-name]')!;
    const subEl = this.root.querySelector<HTMLElement>('[data-user-sub]')!;
    const avatarEl = this.root.querySelector<HTMLElement>('[data-user-avatar]')!;
    if (user) {
      nameEl.textContent = user.name;
      subEl.textContent = user.activityType ?? 'No activity set';
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
    } else {
      nameEl.textContent = 'No profile';
      subEl.textContent = 'Click to manage';
      avatarEl.textContent = '?';
    }
  }

  private renderWorkspace(state: AppState): void {
    const content = this.root.querySelector<HTMLElement>('[data-workspace-content]')!;
    const expected = state.activePage;
    if (content.dataset.page === expected) {
      this.updateDashboard(content, state);
      return;
    }
    this.yogaStudio?.destroy();
    this.yogaStudio = null;
    this.physioStudio?.destroy();
    this.physioStudio = null;
    this.profileEditor?.destroy();
    this.profileEditor = null;
    this.sessionBrowser?.destroy();
    this.sessionBrowser = null;
    this.progressDashboard?.destroy();
    this.progressDashboard = null;
    this.biomechanicsLab?.destroy();
    this.biomechanicsLab = null;
    if (state.activePage === 'dashboard') {
      content.replaceChildren(this.dashboard());
    } else if (state.activePage === 'yoga') {
      this.yogaStudio = new YogaStudio(this.yoga, this.avatar.element);
      content.replaceChildren(this.yogaStudio.element);
      requestAnimationFrame(() => this.avatar.resize());
    } else if (state.activePage === 'physiotherapy') {
      this.physioStudio = new PhysiotherapyStudio(this.physio, this.avatar.element);
      content.replaceChildren(this.physioStudio.element);
      requestAnimationFrame(() => this.avatar.resize());
    } else if (state.activePage === 'biomechanics') {
      this.avatar.setReplayMode(false);
      this.biomechanicsLab = new BiomechanicsLab(this.avatar, this.recorder);
      content.replaceChildren(this.biomechanicsLab.element);
    } else if (state.activePage === 'settings') {
      this.profileEditor = new ProfileEditor();
      content.replaceChildren(this.profileEditor.element);
    } else if (state.activePage === 'sessions') {
      this.sessionBrowser = new SessionBrowser();
      content.replaceChildren(this.sessionBrowser.element);
    } else if (state.activePage === 'analytics') {
      this.progressDashboard = new ProgressDashboard();
      content.replaceChildren(this.progressDashboard.element);
    } else {
      content.replaceChildren(this.placeholder(state.activePage));
    }
    content.dataset.page = expected;
    this.updateDashboard(content, state);
  }

  private dashboard(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'dashboard-page page-enter';
    page.dataset.page = 'dashboard';
    page.innerHTML = `<section class="dashboard-intro"><div><span class="eyebrow accent">BMDT live environment</span><h2>See the body as a<br><em>living system.</em></h2><p>A composed workspace for real-time motion capture, future clinical insight, and elite performance review.</p></div><button class="new-session" disabled>${icon('plus')}<span>New session</span></button></section><section class="metric-grid" data-metrics></section><section class="hero-grid"><div class="avatar-slot"></div><section class="signal-card glass-panel"><span class="eyebrow">System signal</span><div class="signal-orb"><div></div></div><strong data-signal-title>Preparing live stream</strong><p data-signal-text>The application is waiting for the tracking engine.</p><div class="signal-list"><span><i></i> Engine transport</span><b data-connection-value>Connecting</b></div><div class="signal-list"><span><i></i> Skeleton frame</span><b data-frame-value>Waiting</b></div></section></section>`;
    page.querySelector<HTMLElement>('.avatar-slot')!.append(this.avatar.element);
    return page;
  }

  private updateDashboard(container: HTMLElement, state: AppState): void {
    const metrics = container.querySelector<HTMLElement>('[data-metrics]');
    if (metrics) {
      const partCount = state.latestPose?.trackedBodyParts ?? 0;
      const active = state.connection === 'connected' && partCount > 0;
      metrics.innerHTML = [
        ['Connection status', state.connection === 'connected' ? 'Connected' : state.connection === 'connecting' ? 'Connecting' : 'Offline', state.connection],
        ['Active sensors', partCount ? String(partCount).padStart(2, '0') : '—', active ? 'live' : 'quiet'],
        ['Current activity', 'Ready', 'quiet'],
        ['Session duration', '00:00:00', 'quiet'],
        ['Tracking quality', active ? 'Stream active' : 'Awaiting feed', active ? 'live' : 'quiet'],
        ['Live skeleton', active ? 'Available' : 'Standby', active ? 'live' : 'quiet'],
      ].map(([label, value, tone]) => `<article class="metric-card glass-panel" data-tone="${tone}"><span>${label}</span><strong>${value}</strong><i></i></article>`).join('');
    }
    const signalTitle = container.querySelector<HTMLElement>('[data-signal-title]');
    const signalText = container.querySelector<HTMLElement>('[data-signal-text]');
    if (signalTitle && signalText) {
      const active = Boolean(state.latestPose?.trackedBodyParts);
      signalTitle.textContent = active ? 'Live skeletal stream' : state.connection === 'connected' ? 'Connected to engine' : 'Preparing live stream';
      signalText.textContent = active ? 'Canonical pose frames are flowing into the application runtime.' : 'The application is waiting for skeletal frames from the tracking engine.';
      container.querySelector<HTMLElement>('[data-connection-value]')!.textContent = state.connection === 'connected' ? 'Online' : state.connection === 'connecting' ? 'Connecting' : 'Offline';
      container.querySelector<HTMLElement>('[data-frame-value]')!.textContent = active ? 'Active' : 'Waiting';
    }
  }

  private placeholder(id: Exclude<NavigationId, 'dashboard'>): HTMLElement {
    const copy = pageCopy[id]; const module = this.modules.find(id);
    const page = document.createElement('section');
    page.className = 'placeholder-page page-enter'; page.dataset.page = id;
    page.innerHTML = `<div class="placeholder-stage glass-panel"><div class="placeholder-orbit"></div><div class="placeholder-icon">${icon(copy.icon)}</div><span class="eyebrow accent">${copy.eyebrow}</span><h2>${copy.title}</h2><p>${module?.description ?? copy.text}</p><div class="coming-soon"><span>${icon('spark')}</span><div><strong>Framework ready</strong><small>Activity logic is intentionally reserved for the next phase.</small></div></div></div><div class="placeholder-rail"><article class="rail-card glass-panel"><span>Module input</span><strong>Analysis result</strong><small>Shared movement contract</small></article><article class="rail-card glass-panel"><span>Workspace status</span><strong>Designed</strong><small>Ready for module-specific capabilities</small></article></div>`;
    return page;
  }

  private renderContext(state: AppState): void {
    const panel = this.root.querySelector<HTMLElement>('[data-context-panel]')!;
    const activeTitle = state.activePage === 'dashboard' ? 'Live context' : pageCopy[state.activePage].title;
    const frameActive = Boolean(state.latestPose?.trackedBodyParts);
    const analysis = state.latestAnalysis;
    const spineFlexion = analysis?.jointAngles.get('spine')?.flexionExtension;
    panel.innerHTML = `<div class="context-header"><div><span class="eyebrow">Context panel</span><h2>${activeTitle}</h2></div><span class="context-spark">${icon('spark')}</span></div><section class="context-focus"><span>Selected focus</span><strong>Whole body</strong><small>Body-part selection will appear here.</small></section><section class="context-block"><span class="eyebrow">Live state</span><div class="context-stat"><span>Connection</span><b data-state="${state.connection}">${state.connection === 'connected' ? 'Connected' : state.connection === 'connecting' ? 'Connecting' : 'Offline'}</b></div><div class="context-stat"><span>Skeleton stream</span><b data-state="${frameActive ? 'connected' : 'disconnected'}">${frameActive ? 'Active' : 'Standby'}</b></div><div class="context-stat"><span>Tracked parts</span><b>${state.latestPose?.trackedBodyParts ?? '—'}</b></div></section><section class="context-block"><span class="eyebrow">Analysis runtime</span><div class="context-stat"><span>Frame validity</span><b data-state="${analysis?.validation.valid ? 'connected' : 'disconnected'}">${analysis ? analysis.validation.valid ? 'Valid' : 'Limited' : 'Waiting'}</b></div><div class="context-stat"><span>Spine flexion</span><b>${diagnosticValue(spineFlexion, '°')}</b></div><div class="context-stat"><span>COM speed</span><b>${diagnosticValue(analysis?.features.centerOfMass.speed, ' m/s')}</b></div></section><section class="context-block muted-context"><span class="eyebrow">Reserved for this workspace</span><p>Future session controls, contextual guidance, and module settings will appear here without disrupting the motion canvas.</p></section><div class="context-bottom"><span>${icon('pulse')} Runtime producing shared analysis results</span></div>`;
  }

  private handleClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-page], [data-action]');
    if (!target) return;
    if (target.dataset.page) this.store.setPage(target.dataset.page as NavigationId);
    if (target.dataset.action === 'collapse') this.store.toggleSidebar();
    if (target.dataset.action === 'context') this.store.toggleContext();
  };
}
