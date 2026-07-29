// 해더 파일
#ifndef _VALUE_ENCODE_H_
#define _VALUE_ENCODE_H_

class EncodeBase
{	
protected:
	EncodeBase( double raw_max , double raw_min , double high , double low );
	virtual ~EncodeBase() {}
protected:
	inline double get_raw_range() const { return raw_range_;  }
	inline double get_encoded_range() const { return encoded_range_;  }
	inline double get_raw_max() const { return raw_max_;  }
	inline double get_raw_min() const { return raw_min_;  }
	inline double get_encoded_max() const { return encoded_max_;  }
	inline double get_encoded_min() const { return encoded_min_;  }
private:
	double raw_range_;
	double encoded_range_;
	double raw_max_;
	double raw_min_;
	double encoded_max_;
	double encoded_min_;
};

// 아날로그 값을 장치마다 정해진 range에 맞게 변환해 주는 클래스
class Encoder : private EncodeBase
{
public:
	Encoder( double raw_max , double raw_min , double high , double low );
	virtual ~Encoder();
	double Get( double raw ) const;
};

#endif // _VALUE_ENCODE_H_