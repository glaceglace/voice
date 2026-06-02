import { TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { FileSizeWarningDialogComponent } from './file-size-warning-dialog.component';

describe('FileSizeWarningDialogComponent', () => {
  let comp: FileSizeWarningDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [FileSizeWarningDialogComponent, MatDialogModule],
      providers: [
        provideAnimationsAsync(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { filename: 'bigfile.wav' } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FileSizeWarningDialogComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(comp).toBeTruthy();
  });

  it('data.filename is correctly injected', () => {
    expect(comp.data.filename).toBe('bigfile.wav');
  });

  it('close(true) closes dialog with true', () => {
    comp.close(true);
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('close(false) closes dialog with false', () => {
    comp.close(false);
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('clicking Cancel button closes with false via DOM', () => {
    const fixture = TestBed.createComponent(FileSizeWarningDialogComponent);
    fixture.componentInstance.data = { filename: 'test.wav' };
    fixture.componentInstance.dialogRef = dialogRef as any;
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    if (buttons.length >= 1) { buttons[0].click(); fixture.detectChanges(); }
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('clicking Continue button closes with true via DOM', () => {
    const fixture = TestBed.createComponent(FileSizeWarningDialogComponent);
    fixture.componentInstance.data = { filename: 'test.wav' };
    fixture.componentInstance.dialogRef = dialogRef as any;
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    if (buttons.length >= 2) { buttons[1].click(); fixture.detectChanges(); }
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });
});
