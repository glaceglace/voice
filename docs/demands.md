# Voice Editor - Requirements Document

## Project Overview
A web-based audio editing application for YouTubers to record, cut, and edit voice content quickly. Built with Node.js/JavaScript/Angular stack targeting low-end hardware while maintaining real-time preview capabilities using REST API for heavy operations.

---

## 1. Target Platform & Architecture

### 1.1 Deployment
- **Platform**: Web-based (browser-only for V1)
- **Technology Stack**: 
  - Frontend: Angular 21 + JavaScript
  - Backend: Node.js REST API server for audio processing
  - Audio Processing: Web Audio API + REST API for heavy operations
- **Browser Support**: Chrome, Firefox, Safari (including iOS Safari)
- **Performance Target**: Low-end hardware friendly

### 1.2 Architecture Constraints
- Single-user application (no multi-user collaboration in V1)
- **REST API-based audio processing** for computationally intensive operations
- Local browser storage for project state and temporary buffers
- REST API fallback for modules that cannot run client-side efficiently
- Real-time preview during editing operations using server-side processing
- Lazy module loading mechanism with progress indicator

---

## 2. Core Features - V1

### 2.1 Audio Recording
- **Microphone Input**: Record from PC/macbook mic via Web Audio API
- **Waveform Visualization**: Real-time waveform display during recording (canvas-based)
- **Recording Controls**: Start, stop functionality
- **Post-Recording Processing**: Treat recorded tracks or imported files separately via REST API

### 2.2 Audio Editing Operations
- **Basic Cuts/Splits**: Cut audio at specific points (REST API processing)
- **Trimming**: Remove silence from start/end of tracks (REST API processing)
- **Merging**: Combine multiple clips into one track (REST API processing)
- **Move/Rearrange**: Reorder clips within timeline (local browser operations)
- **Duplicate**: Copy and paste segments (local browser operations)

### 2.3 Audio Effects (Basic)
- **Fade In/Out**: Smooth transitions at clip boundaries (REST API processing)
- **Volume Adjustment**: Per-track volume control (local browser operations)
- **Noise Gate**: Remove background noise threshold-based (REST API processing)

### 2.4 Timeline & Multi-track Support
- Multiple audio tracks support
- Track layering and mixing via REST API
- Visual timeline with zoom controls (canvas-based rendering)
- Playhead navigation (local browser operations)

---

## 3. File Format Support - V1

### 3.1 Required Import Formats (Must-Have)
| Format | Extension | Priority | Processing Method |
|--------|-----------|----------|-------------------|
| MP3 | .mp3 | High | REST API decoder |
| WAV | .wav | High | Web Audio API + REST API encoder |
| AAC | .aac | High | REST API decoder |
| FLAC | .flac | High | REST API decoder |
| OGG | .ogg | High | REST API decoder |
| M4A | .m4a, .mp4 (audio) | High | REST API decoder |
| WebM | .webm | High | REST API decoder |

### 3.2 Export Formats - V1
- **Direct Download**: Single file export via REST API processing
- No cloud storage integration (V1)
- No social media direct sharing (V1)

---

## 4. Performance Requirements

### 4.1 File Size Handling
- Maximum single file: **500MB** (for import/export)
- **Buffer limit**: Files larger than **256MB** will show warning popup before processing
- Real-time preview during edits using REST API processing
- Smooth playback without buffering on low-end hardware

### 4.2 Hardware Optimization
- Efficient memory management in browser
- Lazy loading of audio data when possible via REST API streaming
- Progressive rendering for large files (canvas-based)
- Server-side processing offloads heavy computations from client

### 4.3 Browser Compatibility
- iOS Safari support with optimized UX (touch-friendly controls)
- Responsive design for different screen sizes
- Graceful degradation for older browsers

---

## 5. User Experience Requirements

### 5.1 Recording Workflow
1. Click "Record" button → microphone access request
2. Real-time waveform visualization via Web Audio API AnalyserNode
3. Stop recording → audio sent to REST API for processing
4. Processed audio saved to timeline

### 5.2 Editing Interface
- **Timeline View**: Multi-track horizontal timeline (canvas-based)
- **Waveform Display**: Visual representation of audio levels (REST API generated images or canvas rendering)
- **Zoom Controls**: Time scale adjustment (playhead zoom)
- **Selection Tools**: Click/drag to select regions
- **Cut Tools**: Scissors icon or keyboard shortcut

### 5.3 Mobile/iOS Considerations
- Touch-friendly UI elements (minimum 44x44px touch targets)
- Swipe gestures for timeline navigation
- Simplified controls for smaller screens
- Portrait and landscape mode support

---

## 6. Technical Constraints & Limitations - V1

### 6.1 Out of Scope for V1
- Pitch shifting and time stretching
- Advanced effects (reverb, echo, compression, EQ)
- Voice isolation/separation from music
- Multi-track recording (record multiple mics simultaneously)
- Background noise reduction during recording
- Professional formats (AIFF, WAV-64 beyond 500MB)
- Cloud storage integration
- Social media direct sharing
- Export to additional formats beyond V1 requirements

### 6.2 Browser & API Processing Strategy
- **REST API-based audio processing** for all computationally intensive operations
- Local browser handles UI, state management, and light-weight operations
- Safari iOS Web Audio API limitations documented and worked around
- Server-side processing for heavy computations (cut/split/merge/effects)
- File size limit enforced at 500MB per file
- **Buffer warning**: Files >256MB trigger popup notification

### 6.3 Module Loading & Testing Strategy
- **Module Loading**: All modules loaded to browser with loading mechanism/progress indicator
- **Audio Storage**: Temporary buffers in browser memory (max 256MB limit)
- **Testing**: Jest + Angular Testing Library for 100% unit test coverage
- **Mock REST API**: Mock server responses for isolated unit testing
- **Mock Web Audio API**: For unit tests without browser context dependency

---

## 7. Future Considerations (Post-V1)

### 7.1 Potential Enhancements
- Advanced audio effects suite (server-side processing)
- Batch processing capabilities via REST API
- Template system for common workflows
- Plugin architecture for third-party effects
- Cloud collaboration features
- AI-powered noise reduction (REST API endpoint)
- Voice cloning/synthesis integration

---

## 8. Success Metrics - V1

### 8.1 Performance Metrics
- Audio playback: <200ms latency on low-end hardware
- Import time: <5 seconds for 50MB files (via REST API)
- Export time: <30 seconds for 500MB files (via REST API)
- Real-time preview: Smooth at 4x speed minimum

### 8.2 User Experience Metrics
- Recording workflow: <10 clicks from start to finish
- Cut operation: <2 clicks (select + cut, with REST API processing)
- Mobile usability: Touch gestures intuitive within first use

---

## 9. Development Phases

### Phase 1: Foundation (Weeks 1-4)
- Project setup (Angular 21 + Node.js REST API)
- Audio recording module (Web Audio API)
- Basic waveform visualization (canvas-based)
- Timeline UI skeleton
- REST API server infrastructure

### Phase 2: Core Editing (Weeks 5-8)
- Cut/split operations via REST API
- Multi-track support with local state management
- Import/export functionality via REST API
- Real-time preview system using server processing

### Phase 3: Polish & Optimization (Weeks 9-12)
- Performance optimization for low-end hardware
- iOS Safari compatibility fixes
- UX refinements
- Testing across target browsers
- **Jest + Angular Testing Library setup** for unit tests
- **REST API mocking** strategy implementation
- **Web Audio API mocking** for isolated testing

---

## 10. Assumptions & Dependencies

### Assumptions
- Users have modern browsers with Web Audio API support
- Microphone permissions granted by users
- Stable internet connection for REST API communication
- Users understand basic audio editing concepts
- **Development team has Jest + Angular Testing Library expertise**

### External Dependencies
- Angular 21 framework and dependencies
- Node.js REST API server
- Web Audio API browser implementation
- File system access API (for downloads)
- **Jest testing framework**
- **Angular Testing Library** for component/unit tests
- **REST API mocking tools** (Mock Service Worker or MSW)

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Safari iOS audio limitations | High | Early testing, fallback strategies |
| REST API server performance on large files | Medium | Server-side optimization, chunked processing |
| Browser compatibility issues with Web Audio API | Medium | Feature detection, graceful degradation |
| Memory leaks with long recordings | Medium | Regular garbage collection, chunked processing |
| **Achieving 100% test coverage** | High | Mock REST API responses, mock Web Audio API, comprehensive test strategy |

---

*Document Version: 2.0 (Updated - REST API focus)*  
*Last Updated: Current Date*  
*Status: Approved for Development*
