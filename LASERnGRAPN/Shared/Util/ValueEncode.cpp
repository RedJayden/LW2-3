// cpp파일
#include "pch.h"
#include "ValueEncode.h"

#ifdef _DEBUG
#define new DEBUG_NEW
#undef THIS_FILE
static char THIS_FILE[] = __FILE__;
#endif

//------------------------------------------------------------------------------------
// encode_base
EncodeBase::EncodeBase(double raw_max, double raw_min, double high, double low) :
	raw_max_(raw_max),
	raw_min_(raw_min),
	encoded_max_(high),
	encoded_min_(low)
{
	raw_range_ = raw_max_ - raw_min_;
	encoded_range_ = encoded_max_ - encoded_min_;
}

//------------------------------------------------------------------------------------
// Encoder
Encoder::Encoder(double raw_max, double raw_min, double high, double low) :
	EncodeBase(raw_max, raw_min, high, low) {
}

Encoder::~Encoder() {}

double Encoder::Get(double raw) const
{
	// 범위 체크 (raw_max와 raw_min의 대소관계 고려)
	double actual_max = (get_raw_max() > get_raw_min()) ? get_raw_max() : get_raw_min();
	double actual_min = (get_raw_max() > get_raw_min()) ? get_raw_min() : get_raw_max();

	if (raw > actual_max || raw < actual_min)
		return 0.0;

	// 선형 변환 공식
	double ratio = (raw - get_raw_min()) / get_raw_range();
	return get_encoded_min() + ratio * get_encoded_range();
}
//------------------------------------------------------------------------------------