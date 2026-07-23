import './styles.css';
import { BiomechanicsAnalysisPipeline } from './analysis';
import { YogaModule } from './modules/yoga/yoga-module';
import { PhysiotherapyModule } from './modules/physiotherapy/physiotherapy-module';
import { ModuleRegistry } from './modules/registry';
import { AppStore } from './state/app-state';
import { AppShell } from './ui/app-shell';
import { AvatarRuntime } from './ui/avatar-runtime';
import { SessionRecorder } from './platform/recording';

const store = new AppStore();
const modules = new ModuleRegistry();
const analysis = new BiomechanicsAnalysisPipeline();
const recorder = new SessionRecorder();
const avatar = new AvatarRuntime({
  onConnection: (status) => store.setConnection(status),
  onFrame: (frame) => {
    const result = analysis.analyze(frame);
    store.setPose(frame);
    store.setAnalysis(result);
    modules.receiveAnalysisResult(result);
    recorder.recordFrame(frame, result);
  },
});
const yoga = new YogaModule();
const physio = new PhysiotherapyModule();
modules.register(yoga);
modules.register(physio);
const shell = new AppShell(store, modules, avatar, yoga, physio, recorder);
shell.mount(document.querySelector<HTMLElement>('#app')!);
window.addEventListener('beforeunload', () => shell.destroy());
