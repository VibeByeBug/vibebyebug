export type ScreenName =
  | 'login'
  | 'start'
  | 'upload'
  | 'uploadFailed'
  | 'preparing'
  | 'mockPractice'
  | 'corePractice'
  | 'graph'
  | 'micConnect'
  | 'recognized'
  | 'textInput'
  | 'hud'
  | 'report'
  | 'myHistory'
  | 'settings';

export type PreparingStatus = 'uploading' | 'analyzing' | 'ready' | 'failed';

export interface RecognizedQuestionData {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
}
