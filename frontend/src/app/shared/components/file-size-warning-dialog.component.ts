import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-file-size-warning-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Large File Warning</h2>
    <mat-dialog-content>
      <p><strong>{{ data.filename }}</strong> is larger than 256 MB.</p>
      <p>Processing may be slow on low-end hardware. Continue?</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close(false)">Cancel</button>
      <button mat-flat-button color="warn" (click)="close(true)">Continue</button>
    </mat-dialog-actions>
  `,
})
export class FileSizeWarningDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<FileSizeWarningDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { filename: string },
  ) {}

  close(confirmed: boolean): void {
    this.dialogRef.close(confirmed);
  }
}
