import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { CornerActionsComponent } from './corner-actions.component';
import { ProjectService } from '../../../core/services/project.service';
import { PlaybackService } from '../../../core/services/playback.service';
import type { ContextMenuItem } from '../context-menu/context-menu.component';

describe('CornerActionsComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<CornerActionsComponent>>;
  let comp: CornerActionsComponent;
  let project: ProjectService;
  let playback: { stop: ReturnType<typeof vi.fn> };

  const itemByLabel = (label: string): ContextMenuItem =>
    comp.menuItems.find(i => i.label.startsWith(label))!;

  beforeEach(async () => {
    localStorage.clear();
    playback = { stop: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CornerActionsComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: PlaybackService, useValue: playback },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CornerActionsComponent);
    comp = fixture.componentInstance;
    project = TestBed.inject(ProjectService);
    fixture.detectChanges();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('creates the component', () => {
    expect(comp).toBeTruthy();
  });

  it('hides undo chip when there is no history', () => {
    expect(fixture.nativeElement.querySelector('.undo-btn')).toBeNull();
  });

  it('shows undo chip once an undoable change exists, and click undoes it', () => {
    project.addTrack();
    fixture.detectChanges();
    const undoBtn = fixture.nativeElement.querySelector('.undo-btn') as HTMLElement;
    expect(undoBtn).not.toBeNull();
    undoBtn.click();
    fixture.detectChanges();
    expect(project.state().tracks).toHaveLength(1);
  });

  it('clicking export button emits exportOpen', () => {
    let emitted = false;
    comp.exportOpen.subscribe(() => { emitted = true; });
    (fixture.nativeElement.querySelector('.export-btn') as HTMLElement).click();
    expect(emitted).toBe(true);
  });

  it('openMenu shows the menu at the button position', () => {
    (fixture.nativeElement.querySelector('.more-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(comp.menuVisible()).toBe(true);
    expect(comp.menuItems.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.parentElement?.querySelector('app-context-menu') ?? fixture.nativeElement.querySelector('app-context-menu')).not.toBeNull();
  });

  it('menu closes via context-menu closed event', () => {
    comp.openMenu({ currentTarget: document.createElement('button'), stopPropagation: vi.fn() } as unknown as MouseEvent);
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(comp.menuVisible()).toBe(false);
  });

  it('"Add a layer" menu item adds a track', () => {
    comp.openMenu({ currentTarget: document.createElement('button'), stopPropagation: vi.fn() } as unknown as MouseEvent);
    const before = project.state().tracks.length;
    itemByLabel('Add a layer').action();
    expect(project.state().tracks.length).toBe(before + 1);
  });

  it('snap menu item reflects current state and toggles it', () => {
    expect(project.snapEnabled()).toBe(true);
    comp.openMenu({ currentTarget: document.createElement('button'), stopPropagation: vi.fn() } as unknown as MouseEvent);
    const snapItem = itemByLabel('Snapping');
    expect(snapItem.label).toBe('Snapping on');
    snapItem.action();
    expect(project.snapEnabled()).toBe(false);

    // Re-open: label reflects the off state
    comp.openMenu({ currentTarget: document.createElement('button'), stopPropagation: vi.fn() } as unknown as MouseEvent);
    expect(itemByLabel('Snapping').label).toBe('Snapping off');
  });

  it('startOver resets project when confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    project.addTrack();
    comp.startOver();
    expect(playback.stop).toHaveBeenCalled();
    expect(project.state().tracks).toHaveLength(1);
    expect(project.canUndo()).toBe(false);
  });

  it('startOver does nothing when cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    project.addTrack();
    comp.startOver();
    expect(playback.stop).not.toHaveBeenCalled();
    expect(project.state().tracks).toHaveLength(2);
  });

  it('"Start over…" menu item routes to startOver', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    comp.openMenu({ currentTarget: document.createElement('button'), stopPropagation: vi.fn() } as unknown as MouseEvent);
    itemByLabel('Start over').action();
    expect(window.confirm).toHaveBeenCalled();
  });
});
