#pragma once
#include <cmath>

using mm_per_sec_t  = double; // 모터에서 공통으로 사용하는 속도
using rps_per_sec_t = double; // 모터에서 공통으로 사용하는 가감속

using rps_t  = double;
using pps_t  = int;

using msec_t  = int;
using mm_t    = double; // 밀리 미터
using um_t    = double; // 마이크로 미터
using pulse_t = int;

namespace UnitCvrt
{
    ///////////////////////////////////////////////////////////////////////////////////
    // -- 위치값에 대한 변환
    ///////////////////////////////////////////////////////////////////////////////////
    namespace Pos
    {
        // pulse         : 현재 모터의 펄스 
        // mm_for_rev    : 스크류 한바퀴에 이동 mm 
        // pulse_per_rev : 스큐류 한바퀴 회전에 필요한 펄스
        // return        : 변환된 밀리미터(mm) 값
        constexpr inline mm_t pulse_to_mm( pulse_t pulse , mm_t mm_for_rev , pulse_t pulse_per_rev ) 
        { 
            return ( (double)pulse / (double)pulse_per_rev ) * mm_for_rev; 
        }

        // mm            : 현재 모터의 위치
        // mm_for_rev    : 스크류 한바퀴에 이동 mm 
        // pulse_per_rev : 스큐류 한바퀴 회전에 필요한 펄스
        // return        : 변환된 펄스(pulse) 값
        constexpr inline pps_t mm_to_pulse( mm_t mm , mm_t mm_for_rev , pulse_t pulse_per_rev ) 
        { 
            return (pps_t)( (mm / mm_for_rev) * (double)pulse_per_rev );
        }

        constexpr inline um_t mm_to_um( mm_t mm )
        {
            return (um_t)(mm * 1000.0);
        }

        constexpr inline mm_t um_to_mm( um_t um )
        {
            return (mm_t)(um / 1000.0);
        }
    };

    ///////////////////////////////////////////////////////////////////////////////////
    // -- 속력단위들에 대한 변환
    ///////////////////////////////////////////////////////////////////////////////////
    namespace Vel
    {
        // pulse_per_second : 초당 발생하는 펄스
        // pulse_per_rev    : 스큐류 한바퀴 회전에 필요한 펄스
        // return           : 변환된 초당 회전수(rps)
        constexpr inline rps_t pps_to_rps( double pulse_per_second , double pulse_per_rev ) 
        {
            return (rps_t)( pulse_per_second / pulse_per_rev );
        }

        // rev_per_second : 초당 회전하는 횟수
        // pulse_per_rev  : 스큐류 한바퀴 회전에 필요한 펄스
        // return         : 변환된 초당 펄스 수(pps)
        constexpr inline pps_t rps_to_pps( double rev_per_second , double pulse_per_rev )
        {
            return (pps_t)( rev_per_second * pulse_per_rev );
        }

        // rev_per_second : 초당 회전하는 횟수
        // mm_for_rev     : 스크류 한바퀴에 이동 mm 
        // return         : 변환된 초당 밀리미터(mm/sec)
        constexpr inline mm_per_sec_t rps_to_mm_per_sec( double rev_per_second , double mm_for_rev )
        {
            return (mm_per_sec_t)( rev_per_second * mm_for_rev );
        }

        // pulse_per_second : 초당 발생하는 펄스 
        // mm_for_rev       : 스크류 한바퀴에 이동 mm 
        // pulse_per_rev    : 스큐류 한바퀴 회전에 필요한 펄스
        // return           : 변환된 초당 밀리미터(mm/sec)
        constexpr inline mm_per_sec_t pps_to_mm_per_sec( double pulse_per_second , double mm_for_rev , int pulse_per_rev )
        {
            double rev_per_second = pulse_per_second / (double)pulse_per_rev;

            return (mm_per_sec_t)( rev_per_second * mm_for_rev );
        }

        // mm_per_sec : 초당 이동하는 mm
        // mm_for_rev : 스크류 한바퀴에 이동 mm
        // return     : 변환된 초당 회전수(rps)
        constexpr inline rps_t mm_per_sec_to_rps( double mm_per_second , double mm_for_rev )
        {
            // rev_per_second * mm_for_rev = mm_per_second 이므로
            // rev_per_second = mm_per_second / mm_for_rev
            return (rps_t)( mm_per_second / mm_for_rev );
        }

        // mm_per_second : 초당 이동하는 mm
        // mm_for_rev    : 스크류 한바퀴에 이동 mm
        // pulse_per_rev : 스크류 한바퀴 회전에 필요한 펄스
        // return        : 변환된 초당 펄스 수(pps)
        constexpr inline pps_t mm_per_sec_to_pps( double mm_per_second , double mm_for_rev , int pulse_per_rev )
        {
            // 먼저 mm/sec를 rps로 변환
            double rev_per_second = mm_per_second / mm_for_rev;
            // 그 다음 rps를 pps로 변환
            return (pps_t)( rev_per_second * (double)pulse_per_rev );
        }
    };

    ///////////////////////////////////////////////////////////////////////////////////
    // 가속도에 대한 변환 
    // 등속 운동 이전과 이후, 가속과 감속에 대한 값을 공통된 단위로 변환하는것이 목적.
    ///////////////////////////////////////////////////////////////////////////////////
    namespace Accel
    {
        // 설명 : pps 속도 변화와 msec 시간을 rps/s 가속도로 변환
        // start_speed_pps: 가속/감속이 시작되는 속도 (pps)
        // move_speed_pps: 가속/감속이 완료될 목표 속도 (pps)
        // duration_msec: 시작 속도에서 목표 속도까지 도달하는 데 걸리는 시간 (msec)
        // pulse_per_rev: 스크류 한바퀴 회전에 필요한 펄스 (pps를 rps로 변환하기 위함)
        // return: 해당 속도 변화를 주어진 시간 내에 달성하기 위한 각가속도 (rps/s)
        constexpr inline rps_per_sec_t pps_to_rps_per_sec( double start_speed_pps , double move_speed_pps, 
                                                           int duration_msec      ,  int pulse_per_rev )
        {
            double start_velocity_rps = start_speed_pps / (double)pulse_per_rev;
            double end_velocity_rps   = move_speed_pps / (double)pulse_per_rev;

            double duration_seconds   = (double)duration_msec / 1000.0;
            double delta_velocity_rps = end_velocity_rps - start_velocity_rps;

            return (rps_per_sec_t)( delta_velocity_rps / duration_seconds );
        }

        // 설명 : rps/s 가속도를 사용하여 pps 속도 변화에 필요한 msec 시간을 계산
        // rps_per_sec: 목표 각가속도 (rps/s).
        // start_speed_pps: 가속/감속이 시작되는 속도 (pps)
        // move_speed_pps: 가속/감속이 완료될 목표 속도 (pps)
        // pulse_per_rev: 스크류 한바퀴 회전에 필요한 펄스 (pps를 rps로 변환하기 위함)
        // return: 목표 가속도로 지정된 속도 변화를 달성하는 데 필요한 시간 (msec).
        constexpr inline msec_t rps_per_sec_to_msec( double rps_per_sec , 
                                                     double start_speed_pps , double move_speed_pps , 
                                                     int pulse_per_rev )
        {
            double start_velocity_rps = start_speed_pps / (double)pulse_per_rev;
            double end_velocity_rps   = move_speed_pps / (double)pulse_per_rev;

            double delta_velocity_rps = end_velocity_rps - start_velocity_rps;
            double time_in_seconds    = delta_velocity_rps / rps_per_sec;

            return (msec_t)( time_in_seconds * 1000.0 );
        }
    };
}