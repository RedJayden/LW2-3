API 개요, 버전 기록

VER 0.0.1
1. VISIONMODULE_APP 사용 시 exe 로 빌드
   VISIONMODULE_EXPORTS 사용 시 dll 로 빌드

2. 다이얼로그 베이스로 MVS API 사용하여 
   HikRobot(MVS), Basler 카메라 영상 출력 완료


연결 체크포인트

// 아래 내용 추후 적용
스레딩/성능: 지금은 안전 우선으로 한 번 복사(FrameBuffer.Push) 합니다. 추후 공유메모리/Zero-copy로 업그레이드 가능.

타임스탬프: 래퍼의 FPS 콜백만 제공되므로 host clock을 사용했습니다. 장치 TS가 필요하면 CHikCamWrapper에 TS 노출을 추가해 주세요(옵션).

디자인 패턴 메모

Strategy: ICamDriver ← HikDriver 구현.

Observer: CHikCamWrapper::SetOnFrame → HikDriver::OnWrapperNotify → 상위 onFrame_.

Facade: 최종적으로 VisionModuleImpl/Export가 외부에 단일 C API 제공.

필요하면 Basler(스텁)도 실제 pylon 기반으로 교체해 드릴 수 있고, CHikCamWrapper에 장치 타임스탬프 전달 콜백을 추가하는 리팩토링도 이어서 해 드릴게요.