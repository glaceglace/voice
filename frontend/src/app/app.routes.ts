import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/editor/editor.component').then(m => m.EditorComponent),
  },
  { path: '**', redirectTo: '' },
];
