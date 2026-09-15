export type ScreenName =
  | 'start'
  | 'upload'
  | 'preparing'
  | 'mic'
  | 'recognized'
  | 'textInput'
  | 'hud'
  | 'error';

export type PreparingStatus = 'uploading' | 'analyzing' | 'ready' | 'failed';

export interface RecognizedQuestionData {
  partialText: string;
  finalText: string;
  isConfirmed: boolean;
}
