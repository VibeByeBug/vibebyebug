import { Hud } from './components/Hud';
import { useQaSocket } from './hooks/useQaSocket';
import { mockQaResult } from './mocks/qaMock';

function App() {
  const { isConnected, lastResult } = useQaSocket();

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto mb-4 max-w-2xl text-sm text-gray-500">
        WebSocket: {isConnected ? '연결됨' : '연결 대기 중'}
      </div>
      <Hud result={lastResult ?? mockQaResult} />
    </div>
  );
}

export default App;
