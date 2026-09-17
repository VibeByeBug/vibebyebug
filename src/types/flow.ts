export type ScreenName =
  | 'login'
  | 'start'
  | 'upload'
  | 'uploadFailed'
  | 'preparing'
  | 'mockPractice'
  | 'micConnect'
  | 'mic'
  | 'recognized'
  | 'textInput'
  | 'hud'
  | 'error'
  | 'report'
  | 'myHistory'
  | 'settings';

export type PreparingStatus = 'uploading' | 'analyzing' | 'ready' | 'failed';

export interface RecognizedQuestionData {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
}
