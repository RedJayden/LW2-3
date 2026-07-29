/**
 * @file AureliaController.h
 * @brief Aurelia 레이저 제어 인터페이스 및 컨트롤러
 * @author Antigravity
 */

#include "pch.h"
#pragma once

#include <memory>
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include "../Modules/Laser/Aurelia/AureliaIR50.h"

/**
 * @brief 레이저 제어 인터페이스 (인터페이스 패턴)
 */
class IAureliaController {
public:
    virtual ~IAureliaController() = default;

    virtual BOOL Initialize() = 0;
    virtual BOOL Initialize(int comPort) = 0;
    virtual void Finalize() = 0;

    virtual void TurnOn() = 0;
    virtual void TurnOff() = 0;
    virtual void OpenShutter() = 0;
    virtual void CloseShutter() = 0;

    virtual void SetFrequency(int khz) = 0;
    virtual void SetPower(float percent) = 0;
    virtual void SetBurst(int count) = 0;
    virtual void SetPulseWidth(int fs) = 0;
    virtual void SetControlMode(int mode) = 0;

    virtual std::string GetStatusJson() = 0;
};

/**
 * @brief Aurelia 레이저 컨트롤러 실구현체
 */
class AureliaController : public IAureliaController {
public:
    static AureliaController& Instance() {
        static AureliaController instance;
        return instance;
    }

    // IAureliaController 구현
    BOOL Initialize() override;
    BOOL Initialize(int comPort) override;
    void Finalize() override;

    void TurnOn() override;
    void TurnOff() override;
    void OpenShutter() override;
    void CloseShutter() override;

    void SetFrequency(int khz) override;
    void SetPower(float percent) override;
    void SetBurst(int count) override;
    void SetPulseWidth(int fs) override;
    void SetControlMode(int mode) override;

    std::string GetStatusJson() override;
    
    bool IsUsed() const { return m_used; }

private:
    AureliaController();
    virtual ~AureliaController();

    std::unique_ptr<AureliaIR50> m_laser;
    bool m_used = true;

    std::thread m_pollingThread;
    std::atomic<bool> m_stopPolling{false};
    std::mutex m_cacheMutex;
    std::string m_cachedStatusJson;

    void PollingThreadFunc();
};
