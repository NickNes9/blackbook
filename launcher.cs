using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;
[assembly: AssemblyTitle("Black Book")]
[assembly: AssemblyProduct("Black Book")]
[assembly: AssemblyDescription("Portable personal finance app")]
[assembly: AssemblyVersion("0.9.5.0")]
[assembly: AssemblyFileVersion("0.9.5.0")]
static class Launcher
{
    static void Main(string[] args)
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        try
        {
            var psi = new ProcessStartInfo();
            string versionFile = Path.Combine(dir, "runtime", "version.txt");
            string executable = "node.exe";
            if (File.Exists(versionFile))
            {
                string version = File.ReadAllText(versionFile).Trim();
                if (!Regex.IsMatch(version, @"^\d+\.\d+\.\d+$")) throw new Exception("The download is incomplete. Extract a fresh ZIP.");
                executable = Path.Combine(dir, "runtime", "node-v" + version + "-win-x64.exe");
                if (!File.Exists(executable)) throw new Exception("The download is incomplete. Extract the whole ZIP before opening Black Book.");
            }
            psi.FileName = executable;
            bool stop = Array.IndexOf(args, "--stop") >= 0;
            psi.Arguments = "\"" + Path.Combine(dir, "lib", stop ? "stop.js" : "launch.js") + "\"";
            if (Array.IndexOf(args, "--no-browser") >= 0) psi.Arguments += " --no-browser";
            psi.WorkingDirectory = dir;
            psi.EnvironmentVariables["BLACK_BOOK_DATA_DIR"] = dir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardError = true;
            var process = Process.Start(psi);
            string error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            if (process.ExitCode != 0) throw new Exception(error.Trim());
        }
        catch (Exception error)
        {
            Environment.ExitCode = 1;
            MessageBox.Show("Could not open Black Book. Extract the complete release ZIP into a writable folder and try again.\n\n" + error.Message, "Black Book", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
