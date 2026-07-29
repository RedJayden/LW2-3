#pragma once
#include <algorithm>
#include <map>
#include <list>
#include <vector>
#include <array>
#include <strsafe.h>
#include <limits>
#include ".\Invoke\Invoke.h"
#include "MinidumpHelp.h"
#include "SyncContainer.h"
#include "SyncObject.h"
#include "HighOrderContainer.h"
#include "StringUtil.h"
#include "IniFile.h"
#include "MemoryUtil.h"
#include "TimeUtil.h"
#include "FileSystemUtil.h"
#include "Thread.h"
#include "Serial.h"
#include "ValueEncode.h"
#include "NetworkUtil.h"
#include "SystemUtil.h"
#include "Log.h"

#define Alert(X)         	        ::MessageBox( AfxGetMainWnd()->GetSafeHwnd() , X , _T("Alert") , MB_OK | MB_TOPMOST )
#define YesOrNo(X)                  ::MessageBox( AfxGetMainWnd()->GetSafeHwnd() , X , _T("Yes or No") , MB_OKCANCEL | MB_TOPMOST )

#define RETURN(EXP)				    do { EXP; return;       } while(0)
#define RETURN_V(VALUE)             do { return VALUE;      } while(0)
#define RETURN_F_V(EXP,VALUE)		do { EXP; return VALUE; } while(0)
#define RETURN_MSG(MESSAGE)		    RETURN( Alert( MESSAGE ) )
#define RETURN_MSG_V(MESSAGE,VALUE) RETURN_F_V( Alert( MESSAGE ) , VALUE )

#define CONTINUE(EXP)				{ EXP; continue; }
#define CONTINUE_SLEEP(TICK)		CONTINUE(Sleep(TICK))

#define BREAK(EXP)				    { EXP; break; }

#define IS_ODD(X)				    ((X)&1)
#define IS_EVEN(X)				    (!IS_ODD((X)))

#define NOW64() GetTickCount64()


#define SEC(X) (1000*X)
#define MIN(X) (SEC(60) * X)

#define ei else if
#define es else

#define BIND_METHOD( Fn ) std::bind( Fn , this )
#define BIND_METHOD_1( Fn ) std::bind( Fn , this , std::placeholders::_1 )
#define BIND_METHOD_2( Fn ) std::bind( Fn , this , std::placeholders::_1 , std::placeholders::_2 )
#define BIND_METHOD_3( Fn ) std::bind( Fn , this , std::placeholders::_1 , std::placeholders::_2 , std::placeholders::_3 )

#define BIND_FN( Fn ) std::bind( Fn )
#define BIND_FN_1( Fn ) std::bind( Fn , std::placeholders::_1 )
#define BIND_FN_2( Fn ) std::bind( Fn , std::placeholders::_1 , std::placeholders::_2 )
#define BIND_FN_3( Fn ) std::bind( Fn , std::placeholders::_1 , std::placeholders::_2 , std::placeholders::_3 )

template<typename T>
using Vector2D = std::vector< std::vector<T> >;

constexpr double PI = 3.14159265358979323846;

enum class TriBOOL
{
    Indeterm = -1 ,
    False    = 0  ,
    True     = 1  ,
};

// std::clamp 함수
template <typename T>
inline T Clamp(const T& value, const T& low, const T& high)
{
    return (value < low) ? low : (value > high) ? high : value;
}