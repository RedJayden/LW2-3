import "./CircleSpinner.css";

export function CircleSpinner() {
  return (
    // 회전하는 컨테이너이자 가는 흰색 원
    <div className="minimal-spinner">
      {/* 점(dot) 공통 스타일 */}
      <span className="minimal-dot dot-a"></span>
      <span className="minimal-dot dot-b"></span>
    </div>
  );
}
