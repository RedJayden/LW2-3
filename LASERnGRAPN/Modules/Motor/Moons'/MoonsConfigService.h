#pragma once

#include <string>

struct ConnectParams
{
    int com = 7;
    int baudrate = 9600;
};

struct MotionProfile
{
    double run_vel = 10.0;
    double run_acc = 100.0;
    double run_dec = 100.0;
};

struct MoonsLensParams
{
    int id = 1;
    double lead = 2.0;
    int pluse = 20000;

    MotionProfile home;
    MotionProfile move;
    MotionProfile jog;

    double x20 = 0.0;
    double x20_z_pos = 0.0;
    double x20_safe_z = 0.0;
    double stage_x20_offset = 0.0;
    double stage_y20_offset = 0.0;

    double x50 = 0.0;
    double x50_z_pos = 0.0;
    double x50_safe_z = 0.0;
    double stage_x50_offset = 0.0;
    double stage_y50_offset = 0.0;
};

struct MoonsMirrorParams
{
    int id = 2;
    double lead = 2.0;
    int pluse = 20000;

    MotionProfile home;
    MotionProfile move;
    MotionProfile jog;

    double scanner_pos = 0.0;
    double scanner_z_pos = 0.0;
    double scanner_safe_z = 0.0;
    double objective_pos = 0.0;

    double stage_x_offset = 0.0;
    double stage_y_offset = 0.0;
};

class MoonsConfigService
{
public:
    static MoonsConfigService& Instance()
    {
        static MoonsConfigService instance;
        return instance;
    }

    MoonsConfigService(const MoonsConfigService&) = delete;
    MoonsConfigService& operator=(const MoonsConfigService&) = delete;

    void Load();
    void Save();

    ConnectParams& GetConnect() { return m_connect; }
    MoonsLensParams& GetLens() { return m_lens; }
    MoonsMirrorParams& GetMirror() { return m_mirror; }

private:
    MoonsConfigService() = default;
    ~MoonsConfigService() = default;

    ConnectParams m_connect;
    MoonsLensParams m_lens;
    MoonsMirrorParams m_mirror;
};
