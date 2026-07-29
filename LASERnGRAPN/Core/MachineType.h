#pragma once
/**
 * @file MachineType.h
 * @brief MC1/MC2/MC3/MC4 머신 사양 매핑 유틸리티 (하위 호환성용)
 * @details
 *  기존 MachineTypeUtil 네임스페이스의 API를 MachineProfile 싱글톤 기반으로 이관하여,
 *  하드코딩 분기 제거 및 하위 호환성을 동시에 달성한다.
 */

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <tchar.h>
#include <Shlwapi.h>
#include "MachineProfile.h"

namespace MachineTypeUtil
{
	enum class Type { MC1, MC2, MC3, MC4 };

	/**
	 * @brief 현재 프로파일을 기반으로 가상 머신 타입을 역산하여 반환 (하위 호환성 유지)
	 */
	[[deprecated("Use MachineProfile::Instance() instead")]]
	inline Type Get()
	{
		const std::string& motion = MachineProfile::Instance().GetMotion();
		const std::string& laser = MachineProfile::Instance().GetLaser();
		bool hasLens = MachineProfile::Instance().HasLensMotor();

		if (motion == "PMAC") {
			if (laser == "Aurelia" || laser == "JPT") {
				if (hasLens) {
					return Type::MC1;
				} else {
					return Type::MC2;
				}
			}
			return Type::MC1; // fallback
		} else if (motion == "Fastech") {
			if (MachineProfile::Instance().HasZeroG()) {
				return Type::MC3;
			} else {
				return Type::MC4;
			}
		}
		return Type::MC1;
	}

	/** @brief MC3 여부 (Fastech + ZeroG) */
	[[deprecated("Use MachineProfile::Instance() instead")]]
	inline bool IsMC3() { 
		return MachineProfile::Instance().GetMotion() == "Fastech" && MachineProfile::Instance().HasZeroG(); 
	}

	/** @brief MC4 여부 (Fastech + No ZeroG) */
	[[deprecated("Use MachineProfile::Instance() instead")]]
	inline bool IsMC4() { 
		return MachineProfile::Instance().GetMotion() == "Fastech" && !MachineProfile::Instance().HasZeroG(); 
	}

	/** @brief MC2 여부 (PMAC + Lens Motor 없음) */
	[[deprecated("Use MachineProfile::Instance() instead")]]
	inline bool IsMC2() { 
		return MachineProfile::Instance().GetMotion() == "PMAC" && !MachineProfile::Instance().HasLensMotor(); 
	}

	/** @brief MC1 여부 (PMAC + Lens Motor 있음) */
	[[deprecated("Use MachineProfile::Instance() instead")]]
	inline bool IsMC1() { 
		return MachineProfile::Instance().GetMotion() == "PMAC" && MachineProfile::Instance().HasLensMotor(); 
	}

	/** @brief Lens 모터 존재 여부 */
	inline bool HasLensMotor() { 
		return MachineProfile::Instance().HasLensMotor(); 
	}

	/** @brief JOG X 방향 반전 여부 (0: 정상, 1: 반전) */
	inline int GetJogXDir() {
		return MachineProfile::Instance().GetJogXDir();
	}

	/** @brief JOG Y 방향 반전 여부 (0: 정상, 1: 반전) */
	inline int GetJogYDir() {
		return MachineProfile::Instance().GetJogYDir();
	}

	/** @brief Canvas 기능 사용 여부 (0: 사용안함, 1: 사용) */
	inline int GetUseCanvas() {
		return MachineProfile::Instance().GetUseCanvas();
	}

	/** @brief Process 상세 정보 사용 여부 (0: 숨김, 1: 표시) */
	inline int GetUseProcessDetail() {
		return MachineProfile::Instance().GetUseProcessDetail();
	}

	/** @brief Undo/Redo 최대 히스토리 단계 */
	inline int GetMaxHistorySteps() {
		return MachineProfile::Instance().GetMaxHistorySteps();
	}

	/** @brief Stage Working Limit X Min */
	inline int GetStageMinX() {
		return MachineProfile::Instance().GetStageMinX();
	}

	/** @brief Stage Working Limit X Max */
	inline int GetStageMaxX() {
		return MachineProfile::Instance().GetStageMaxX();
	}

	/** @brief Stage Working Limit Y Min */
	inline int GetStageMinY() {
		return MachineProfile::Instance().GetStageMinY();
	}

	/** @brief Stage Working Limit Y Max */
	inline int GetStageMaxY() {
		return MachineProfile::Instance().GetStageMaxY();
	}
}
