#pragma once
/**
 * @file FrameBuffer.h
 * @brief 간단한 SPSC 스타일 프레임 버퍼(뮤텍스 기반)
 */

#include <vector>
#include <mutex>
#include <atomic>
#include <cstdint>
#include <cstring>
#include "VisionTypes.h"

 /**
  * @class FrameBuffer
  * @brief Producer(드라이버 콜백) - Consumer(엔진/전송) 간 프레임 공유 버퍼
  * @details 현재는 최신 프레임 1개만 유지하는 단순 버전 (ring로 확장 가능)
  * @details 복사/이동 대입 금지(뮤텍스 보유).
  */
class FrameBuffer {
public:
    FrameBuffer() = default;
    FrameBuffer(const FrameBuffer&) = delete;
    FrameBuffer& operator=(const FrameBuffer&) = delete;
    FrameBuffer(FrameBuffer&&) = delete;
    FrameBuffer& operator=(FrameBuffer&&) = delete;

    /**
     * @brief 프레임 데이터를 내부 버퍼에 복사/보관
     * @param src 외부 데이터 포인터
     * @param desc 프레임 메타
     */
    void Push(const uint8_t* src, const VMFrameDesc& desc) {
        std::lock_guard<std::mutex> lk(m_);
        const size_t need = static_cast<size_t>(desc.stride) * desc.height;
        if (buf_.size() != need) buf_.resize(need);
        std::memcpy(buf_.data(), src, need);
        last_.data = buf_.data();
        last_.desc = desc;
        seq_++;
    }

    /**
     * @brief 최신 프레임 뷰를 반환(복사 없음)
     * @param out 출력 뷰
     * @return 유효 여부
     */
    bool Pop(VMFrameView& out) {
        std::lock_guard<std::mutex> lk(m_);
        out = last_;
        return out.data != nullptr;
    }

    /**
     * @brief buffer 클리어
     */
    void Clear() {
        std::lock_guard<std::mutex> lk(m_);
        buf_.clear();
        buf_.shrink_to_fit();
        last_ = {};
        seq_.store(0);
    }

    /// 누적 프레임 시퀀스(디버그용)
    uint64_t Sequence() const noexcept { return seq_.load(); }

private:
    mutable std::mutex m_;
    std::vector<uint8_t> buf_;
    VMFrameView last_{};
    std::atomic<uint64_t> seq_{ 0 };
};
