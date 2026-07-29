// import RecipeCanvas from './Canvas/RecipeCanvas'; // Replaced by CameraView
import CameraView from '../../shell/CameraView';
// import { useCanvasStore } from './Canvas/useCanvasStore';

export default function RecipePage() {
    return (
        <div className="w-full h-full overflow-hidden relative">
            <CameraView />
        </div>
    );
}
