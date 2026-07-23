import type { AnalysisResult } from '../analysis';
import type { CanonicalPoseFrame, ConnectionStatus } from '../types';

export type NavigationId =
  | 'dashboard'
  | 'yoga'
  | 'physiotherapy'
  | 'sports'
  | 'gym'
  | 'posture'
  | 'sessions'
  | 'analytics'
  | 'reports'
  | 'settings'
  | 'biomechanics';

export interface AppState {
  activePage: NavigationId;
  sidebarCollapsed: boolean;
  contextOpen: boolean;
  connection: ConnectionStatus;
  latestPose: CanonicalPoseFrame | null;
  latestAnalysis: AnalysisResult | null;
}

type Listener = (state: Readonly<AppState>) => void;

export class AppStore {
  private state: AppState = {
    activePage: 'dashboard',
    sidebarCollapsed: false,
    contextOpen: true,
    connection: 'connecting',
    latestPose: null,
    latestAnalysis: null,
  };
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  get snapshot(): Readonly<AppState> {
    return this.state;
  }

  setPage(activePage: NavigationId): void {
    this.update({ activePage });
  }

  setConnection(connection: ConnectionStatus): void {
    this.update({ connection });
  }

  setPose(latestPose: CanonicalPoseFrame): void {
    this.update({ latestPose });
  }

  setAnalysis(latestAnalysis: AnalysisResult): void {
    this.update({ latestAnalysis });
  }

  toggleSidebar(): void {
    this.update({ sidebarCollapsed: !this.state.sidebarCollapsed });
  }

  toggleContext(): void {
    this.update({ contextOpen: !this.state.contextOpen });
  }

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
