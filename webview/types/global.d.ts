declare interface Window {
  acquireVsCodeApi?: () => Window;
  vscode: Window;
}

type Recordable<T = any> = Record<string, T>;

declare type ElRef<T extends HTMLElement = HTMLDivElement> = Nullable<T>;

declare module '*.vue' {
  import { defineComponent } from 'vue';
  const Component: ReturnType<typeof defineComponent>;
  export default Component;
}
