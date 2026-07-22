import { BoneT } from 'solarxr-protocol';
import { AppModule, PoseScore } from './types';

export class PoseManager {
  private modules = new Map<string, AppModule>();
  private active: string | null = null;

  register(name: string, module: AppModule) {
    this.modules.set(name, module);
  }

  activate(name: string) {
    if (!this.modules.has(name)) return;
    this.active = name;
    this.modules.get(name)!.setEnabled(true);
  }

  deactivate() {
    if (this.active) {
      const mod = this.modules.get(this.active);
      if (mod) mod.setEnabled(false);
    }
    this.active = null;
  }

  getActive(): AppModule | null {
    if (!this.active) return null;
    return this.modules.get(this.active) ?? null;
  }

  update(skeleton: BoneT[], dt: number): PoseScore | null {
    const mod = this.getActive();
    if (!mod || !mod.isEnabled()) return null;
    return mod.update(skeleton, dt);
  }
}
