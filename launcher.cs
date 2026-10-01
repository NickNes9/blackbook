using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
static class Launcher
{
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        try
        {
            var psi = new ProcessStartInfo();
            psi.FileName = "node.exe";
            psi.Arguments = "\"" + Path.Combine(dir, "lib", "launch.js") + "\"";
            psi.WorkingDirectory = dir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process.Start(psi);
        }
        catch
        {
            MessageBox.Show("Black Book needs Node.js. Install it from nodejs.org and try again.", "Black Book", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
