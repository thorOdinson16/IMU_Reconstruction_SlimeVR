import type { AnalysisResult } from '../analysis';
import type { NavigationId } from '../state/app-state';

export interface ActivityModule {
  id: Extract<NavigationId, 'yoga' | 'physiotherapy' | 'sports' | 'gym' | 'posture'>;
  title: string;
  description: string;
  onAnalysisResult(result: AnalysisResult): void;
}

const noAnalysis = (): void => {
  // Activity-specific logic is intentionally deferred; modules receive only analyzed data.
};

const coreModules: ActivityModule[] = [
  { id: 'physiotherapy', title: 'Physiotherapy', description: 'Clinical movement workspace ready for care protocols.', onAnalysisResult: noAnalysis },
  { id: 'sports', title: 'Sports Lab', description: 'Performance workspace ready for sport-specific telemetry.', onAnalysisResult: noAnalysis },
  { id: 'gym', title: 'Gym Form', description: 'Training workspace ready for exercise sessions.', onAnalysisResult: noAnalysis },
  { id: 'posture', title: 'Posture', description: 'Everyday movement workspace ready for posture sessions.', onAnalysisResult: noAnalysis },
];

export class ModuleRegistry {
  private readonly modules = new Map<string, ActivityModule>();

  constructor() {
    for (const m of coreModules) this.modules.set(m.id, m);
  }

  register(module: ActivityModule): void {
    this.modules.set(module.id, module);
  }

  find(id: NavigationId): ActivityModule | undefined {
    return this.modules.get(id);
  }

  get<T extends ActivityModule>(id: NavigationId): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  receiveAnalysisResult(result: AnalysisResult): void {
    for (const module of this.modules.values()) module.onAnalysisResult(result);
  }
}
