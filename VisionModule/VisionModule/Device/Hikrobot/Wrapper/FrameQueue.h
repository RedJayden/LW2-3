#pragma once
#include <opencv2/core.hpp>
#include <deque>
#include <mutex>

/**
 * @brief 최신 프레임만 유지하는 고정용량 큐
 * @details
 *  - push: 용량 초과 시 가장 오래된 프레임을 즉시 drop
 *  - pop_latest: 최신 한 장만 가져오고 나머지는 모두 폐기
 *  - 스레드 안전
 */
class FrameQueue {
public:
    /// @brief 용량 cap 만큼 보관. cap==0 이면 무시.
    explicit FrameQueue(size_t cap) noexcept : cap_(cap) {}

    /**
     * @brief 새 프레임 이동 푸시 (오래된 프레임은 drop)
     * @param m 입력 cv::Mat (rvalue)
     */
    void push(cv::Mat&& m) {
        std::lock_guard<std::mutex> lk(m_);
        if (cap_ == 0) return;
        // 최신만 유지: 용량 꽉 차면 맨 앞 제거
        if (dq_.size() == cap_) {
            dq_.front().release();
            dq_.pop_front();
        }
        dq_.emplace_back(std::move(m));
    }

    /**
     * @brief 최신 프레임 하나만 꺼내고 나머지는 즉시 폐기
     * @param out 결과 프레임 (이동 대입)
     * @return 성공 여부
     */
    bool pop_latest(cv::Mat& out) {
        std::lock_guard<std::mutex> lk(m_);
        if (dq_.empty()) return false;
        out = std::move(dq_.back());   // 최신 것을 이동
        // 나머지는 즉시 해제
        dq_.clear();
        return !out.empty();
    }

     /// @brief 모든 보관 프레임 해제
     void clear() {
         std::lock_guard<std::mutex> lk(m_);
         for (auto& m : dq_) m.release();
         dq_.clear();
     }

private:
    std::deque<cv::Mat> dq_;
    size_t cap_;
    std::mutex m_;
};