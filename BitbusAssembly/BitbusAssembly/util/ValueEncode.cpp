#include "stdafx.h"
#include "ValueEncode.h"

#ifdef _DEBUG
#define new DEBUG_NEW
#undef THIS_FILE
static char THIS_FILE[]=__FILE__;
#endif

double get_range( double min , double max )
{
	double range = 0.0;

	if ( max > 0 && min < 0 ) range = fabs(fabs(max) + fabs(min));
	else					  range = fabs(fabs(max) - fabs(min));

	return range;
}

//------------------------------------------------------------------------------------
// encode_base
EncodeBase::EncodeBase( double raw_max , double raw_min , double high , double low ) : 
		from_zero_( 0 ) , raw_max_(max(raw_max,raw_min)) , raw_min_(min(raw_max,raw_min))
{
	double max = max( high , low );
	double min = min( high , low );
		
	double raw_range = get_range( raw_min_ , raw_max_ );
	double range	 = get_range( min , max );

	one_range_ = max( raw_range , range ) / min( raw_range , range );
	from_zero_ = min;

	if ( raw_range < range )  one_range_ =  1 / one_range_;
}
//------------------------------------------------------------------------------------

//------------------------------------------------------------------------------------
// Encoder
Encoder::Encoder( double raw_max , double raw_min , double high , double low ) : EncodeBase( raw_max , raw_min , high , low ) {}
Encoder::~Encoder() {}

double Encoder::Get( double raw ) const 
{
	if ( get_raw_max() < raw || get_raw_min() > raw ) return 0.0;

	return ( (raw - get_raw_min()) / get_one_range() ) + get_from_zero(); 
}	
//------------------------------------------------------------------------------------
