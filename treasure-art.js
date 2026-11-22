// HabitArc 16-bit 3/4 RPG Pixel Chest & Slow-Buildup Reveal Engine.
// Single source of truth for both Vault Card sprites (64x64) and the 56-frame
// center takeover reveal stage (112x96) across Wood, Iron, and Gold tiers.

const CHEST_DELTA =
  '1234.4B58.2B4I7B50.B2IJ5I2OH2P9B40.BF6I2O3P4O4I3H9B30.BF6I2N4K2P2IJI8O2P4I5B25.' +
  'BF5I8NF3I2K2O4PO7I4HB23.BF5I8NF3I7N2KF2IJ2I2H4G2B21.B7I8NF2I9NF5IHB5G3B20.' +
  'BI5H2O6NF3I9NF4I2B3G3KG2B19.BI5H8OI3H9NF4INB2G2K2D2K3B18.BI5HO3P4OI2H7O2N6IB2G2K4DKG2B17.' +
  'BI5H5O3PI3H9OI4HB2G2K6DK2B17.BI5H2N4K2OI2H3O4P2OI4HOB2GK6DK2B18.BIHJ3H7NI3H2K7OI4HB2G2K5D2K2B17.' +
  'BI5H8NI3H6N2KI4HOB2G2K4D2K2B18.BF5H8NIHJ9NI4H2B2GK3D2KG2B19.BF5G2L5NI3H9NI4H2BG2K2D2KBF2B19.' +
  'BF5G7LF3G8NI2HJHNB2G2KDKGB2F2B19.BF5GL3O3LF3G6L2NF4H2B2G3K2BFGF2B19.5B2G4L3OB3IB7LF4G2B2GKGB2KFGF2B19.' +
  'BCF2C8BLB3IBL4O2LF4G2B2G2B3KFGF2B19.BCFI3F6C2BS2Q2B6LF4G2BGB3KBKFGF2B19.2BFJFHF2N6C3Q2C8B3G3B3KBIBFGF2B19.' +
  '2B3FHF7NB3Q2B6CFG4B3K3BHBFGF2B19.2BFIHGF6KBQ4SQ4N2CFI3FC2K2B2H2BFGF2B19.2BFIHGF2N4OBRQ2C2QB5NFJFHFC2KBH3BK3F2B19.' +
  '2BFIHGF6NBRQ2C2QB5K3FHFB2K3B3K3F2B19.2BFIHGF3N2LNBR2QC2QB5NFIHGFBKC2B4K3F2B19.2BFIHGF5NL2B5QB5NFIHGFBKN6K2F3B19.' +
  '2BFJFGF6KN3BQ3B5NFIHGFB7KBF3B20.2B3FGF6N2K4B7NFIHGFB6K5B21.2BF2HGF12N7KFIHGFB5K4B23.2B2GFHF3L10N6OFJFGFB4K4B24.' +
  '4B3G3B8L8N3FGFB2K5B26.17B8LF2HGFBK4B36.17B2GFHF5B44.12B3G4B53.9B62.B408.2711.3B1382.1171.3B59.' +
  'B.2IH5B54.I2.J.3I2O2.7B44.F.I4.O.2P.4O4I2.4B2.3B39.2N4K2PI2.J8O2.2IH4B36.6NF.I.2K2.4POI4.2I2H.B23.' +
  'B2I17.7N2KF3.J.H.GB.HB21.BI6H2O17.2N3.I3.B4.G.B22.5H8OI3H15.B3.3KG2.B18.BIH4.O.3P3OI3H7O2.2I7.2K.2D2K.B17.' +
  'BIH10.3P3.9OI5HBG3.D2.2DK2.B16.BIH4.2N4K2.IH5.4P2O.4HB4.D4.DKG.B19.J3.7NIH2.2K7.IH3.O12.G.B15.' +
  'BIH4.N2.5NIH2.6N2KIH4.B2.K7.DK.B16.BFH.H2.N9.J9NIH3.B12.G.B17.F5G2L5.IH2.N6.2N5.B2.K.D2.2K4.B19.' +
  '5G7LF3G8.IH.J.N.G.K2.2K.GB29.3O3LF3G6L2.FH3.B.G3.2KGB24.4B6.3OB3IB7LF4GB4.2G2B25.3BM2BS2BS2B.B3IB.4O2L.4G4.G2BG27.' +
  'G5R5MB.S2Q.B14.2B33.C2G7R3Q2MS2BS4B5.B.G41.3G8R7B48.3C2.4G5R2B2G59.3G1369.2443.5S64.7S65.8S64.5S1435.' +
  '1044.4B58.2B3IH6B50.2BF3IJ4I3P8B41.B2FI2.3I2N4K3P5I6B.4B29.B2I3.I.9NF3IJK2O4POB3IH4B24.BI6H2O6N2FI.8N2KF6I3H2B22.' +
  'BI5H8OI3H9N2FI2.2I2H.GB2HB20.BI5H2O3P3OI3H4O2.O2N2I4.N2B5G3B18.BI6H5O3PI2H9OI5H3BG5KG2B25.2N4K2OI3H3O4P2OI4H2BG3K3DKG3B16.' +
  'BIHJ3.8NIH2.2K7OI4HOBG2K5D2KG2B23.8N3.7N2KI5HB.GK.2D2.2DKG2B16.F5.8NIHJ.9N5.B2.2KD5.DKG.B16.F5G2L6N3.9NIH3.N.G.K8.KG.B16.' +
  'F5G7LF3G9N2.J2.B2.K.D25.ABF5GL3O3LF3G6L2NF4.N.G9.K3.B15.A5B2G4L3OB3IB7LF4G7.4K.GB18.2A6BS2BS2BLB3IBL4O2LF4G3.G.7G20.' +
  '5A4BM4C2BS2Q2B6LF4G.B.4G3B22.4A3B2M3C4D3Q2DS2BS4B3G.B.3BCM2G22.A4.BM4C18D2B2.D3C2MG29.M3C23D3C2MG39.5M11CD3C2M44.' +
  'SBM2.10MC3M61.M1496.853.6B56.2B2F3IJ7B47.2BIF7I2NI3P8B38.B2I6H2O7N2F3IJ2I9B28.BI6H.3P5OI3H9NP2F3I5B22.' +
  'BI6H5O3.2I3H7O2NIF6I4HB21.BI5H2N3K.2OI3H3O4P2O2I5H3B3GBHB19.BIHJ3H2N6.I3H2K3O2.2OI6HB.6GBHB25.3N5.I2H2N5.2KI5H3BG5K2G2B17.' +
  'BFH4.8NIHJ.N8.I4H2B2G2K3D2KG2B18.F5G2L6N3.8N.I4HNB2G2K5DK2G2B16.F6GL3.3LF3G9N2.J2.B.G2K6D2KG2B16.H3.2G5LO2.3RG6L2NFH3.N.G2.2D3.3DKG2B14.' +
  '2A3BM.6HKLB3RB2L4.2LF4GB9.2DKG.B15.4A3BMG4L2H5BH6LF5G12.KG.B14.7A2BM2G3C7L7H4G3.G.3K8.B14.8A3BMG12C4L3.HM3B2G4K2.G18.' +
  '10A2B2MG2D3H12CIGM4BG4KG19.8A4BM2B2.B3H4M4D5C.GM3B2GK3G18.7A4BMC9M4B6M3HDGM4BGB21.5A.B.2M10C11M.3HME.M3B34.D16C9M2G38.' +
  '3D2.15D2C55.4D98.3G2M64.5G3B64.4G4B64.3G2B1435.726.8B54.2B2I3F3K8B45.B2I7H3P2N4K7B37.BIJ5H2N4K3P2I3H3I2K8B29.' +
  'I6H3N2.3NI3H2K2O4PON2I3FK4B24.FH5.3N5.IJ2H7N2K2I6H3BHB21.ABF5G2L6NIH2.N8.I5HB2.4GHB19.ABF6GL3.3LF3G8N.IHJ3H2B2G3KGBHB18.' +
  'AB4.2G5L2.O3RG6L2NFH4.B.G3K2D2KHB17.2A2BM2G7HKLB3RB2L4.2LF4GB2G.K5DK.HB16.3A2BMGI4M2B2H5BH6LF5G.G2.6DKGHB15.' +
  '4A2BM3G5L5M3B6H.4G3.GD3.3DKG2B15.5A2BM2G5E10L2M3B2.2HB.G.K4.2DKG.B14.6A2BM3G5C5D4E5LM2GM2BG2K4.D.KG.B14.' +
  '7A2BM2G5D11C4DGI.MB2G2K24.6A2BM3G15D5CG.M2BG2K4.KG.B18.5A2BM2G5C15DG.GMB2G2K27.3A2BM3G4D11C5D.GM2BG3K27.' +
  '3A2BM2G4M6E5D5CG2.MB2GK32.2B.2G3.6M11E2GM2BG36.B5.6B5M5E3GMBG2.B44.6B3.2M.2GM.BG56.2B.2GM61.M.G38.R6.R56.3QR3.3QR56.3Q4.3Q1690.' +
  '601.5B58.B2IJ2K8B48.A.F7H2N4K7B39.2ABF6G2L6N2IJ2H2K8B30.2AB4.3GL3O3L3R2G8NK2IH4B25.3A2BMGB7H2OB3RB7L2NF2HJ3H3B22.' +
  '4A2BM3G4M2BH.5BHL3O.2LF5G2.G3B20.5A2BM3G11M3B6H.5G.2GK2G2B19.5A2BMGIG5E13M3B2.2H.B.KDKGBHB17.6A2BM3G3.2L6E10M3GMB2.3D2KHB17.' +
  '6A2BM3G5D2L6.2L2E4M2G.MB3.3DKBHB16.6A2BM3G5C10D5LD3.MBK3.2DKGHB17.5A2B.3G5D11C5D.IGMBK3.2DKGHB17.4A2BM4G16D5C2.GMBK3.D2KGHB18.' +
  '3A2BM3G22D.2GMBK3.DKG.HB18.3A2BM3G2.3C2.15D.2GMBK2.D.KG.B20.2A2BM3G2.3D8.3C.4DG2.GMBK3.KG.2B20.2A2BM.2G13.3D2.3C2G.MBGK3.K2.B22.' +
  'A.BM.2G3D15.3D2G.MBGK2.KG.B23.A.BM2.G4M6E4D5.2D3GMBG2.KG2.B29.G.3H6M11E.2GMBG5.B28.2B.B2.H5.7M4.E.2GMBG4.B31.B15.M3H2M2.GMB53.' +
  'B2.H4.GM60.2B64.M1870.601.5A58.3A3B8A49.3AB2F.7B3A3.2A41.3AB4H4G3O3B3R2B8A32.4A2BM.B7H2OB3RBG6BAB2.2A28.' +
  '3AB.BM3G4M.B2H.4BH.4OLB2F.B29.3A2BM4G11M3B7H2.2G.G2.B24.3A2BMGIG5E3.11M3B4H2B3.B23.3A2BM3G5L6E4.7M2G.MB.2KG.B22.' +
  '2A2BM.3G5D10L2E.3M4GMG.2DKGB22.2A2BM.2G3.13D5LD3GMBG2.2DK23.2A2BM.2G3.2C8.5D.3DGIGMBK2.2DK23.2A2BM.2G3.2D9.2C3.2D.3GMB3.D2KH21.' +
  '2A2BM2.G15.2D3.2C.2GMBG2.2DKBH21.2A2BM.2G20.2D.2GMBG2.2DK23.2A2BM.2G3.2C15.2D.2GMBK.2DKGHB21.A.BM2.2G3.2D9.2C3.2D2.GMBG.D.KGH23.' +
  'A.BM2.G15.2D3.2C.2GMBGD2.2GHB22.A.BM2.G10E10.2D.2GMBG3.G.B23.A5.G3.M5.12E2.2GMB37.M2.H5.M10.E2.GMBGK36.B14.M4.E2.GMB2.G50.' +
  'M2.H4.GMB53.B9.B1995.665.2B3.2B56.B2F2IJ2K5.3B.2A44.B2H2.2G2.2O.N2K2R.2B2.2B40.2BMGB2H5.2OB2R.BG2H2K4.B35.' +
  'B.M2G.2M2.2B2H2B3.HL2O2.LN2F2IK32.B.MG2.2M9.2B.2H5.2G4.2B2.A25.2BMGI.GE4.M12.2B.2H2.2B2G3.A24.2BM2G.2L3.2E5.M9.2G.MB2K.G2B.A23.' +
  'B.MG2.2D3.2L8.2E.M3.G2.MB2D.2K2BA23.B.MG2.D14.2L3.D2G2.MG2D2.KGH24.B.MG2.C4.D15.GI.MBG2D2.KGH24.B.MG2.D4.C10.D4.G2.MBKD3.KGHB22.' +
  'B.MG2.D16.C4.G2.MBKD3.KGHB22.B.MG2.D21.G2.MB2D2.2KB24.B.MG2.C4.D16.G2.MB2D2.KGHBA28.D4.C10.D4.G2.MBGD.K.G48.C4.G2.MBGDK.G.2BA24.' +
  'MG24.G2.MB2K.G27.B5.M3.E20.MBK37.H2.M5.E16.KG36.H14.E4.G7.B50.H2.M4.MBG53.H9.G1995.1832.S63.S53.S7.2SW2S50.3S8.S42.R10.S9.S41.3R62.R1900.' +
  '1502.S9.S53.S8.3S41.R8.2SW2S7.S42.R10.S50.2RW2R8.S52.R20.E42.R20.E53.M7.4ME50.H2B8.M42.B10.M9.B41.2MC62.C1900.' +
  '861.2B61.B2UB59.BU2VUB57.BUV2W2UB6.S49.BUV2W3UB4.3S41.R6.BUV2WU2TB5.S42.R7.BUWU2TB47.2RW2R6.BU2TB50.R9.BTB51.R10.B63.' +
  'D9.D53.C8.3D41.A8.4DC7.C42.A10.D50.4AB8.E52.A63.A2220.477.2B56.S4.B2UB59.BU2VUB7.S50.UV2W2UB6.S49.BUV2W3U4.2SW2S47.' +
  'BUV2WU2TB5.S42.R8.UWU2TB6.S41.3R9.2TB50.R7.2GBTBM57.I2GEB3E6.M49.2G5L2E4.E2M41.A6.2G5D2L2.R2.L42.A7.G6D47.5A6.5C50.A9.3D51.A10.D2657.' +
  '221.2B56.S4.B2UB59.BU2VUB7.S50.BUV2W2UB6.S49.BUV2W3UB4.3S41.R3.A2.BUV2WU2TB5.S42.R9.WU2TB6.A40.2RW2R5.2BU2TBA6.A42.' +
  'R6.F2IBT3B4.3B2A40.R6.2H2GBG3O5.R42.A8.6H6.R41.3A7.G4M4.R45.A9.3M62.E134.L2906.157.2B56.S4.B2UB55.A3.BU2VUB7.S49.' +
  'BUV2W.UB6.S56.UB3.2SW2S53.2T5.A.A48.ABU.UT.BA47.R.R6.ABUT.BA47.2AR2A7.B.BA50.A9.JBK51.A10.G70.R63.B3162.' +
  '215.A80.A63.A61.5A61.A42.A20.A41.3A62.A209.B3226.215.S80.S63.S61.2SW2S61.S42.R20.S41.3R62.R209.R3226.' +
  '215.A80.A63.A61.5A61.A42.A20.A41.3A62.A209.B3226.157.2A61.4A59.6A57.8A56.9A55.9A56.7A58.5A61.B63.K767.' +
  'S63.S61.2SW2S61.S63.S2337.1502.D63.C61.4DC61.D63.E2337.601.5B58.B2IJ2K2.6B49.BF7H2N4K3.4B41.BF4G2.2L3N.2N2IJ2H2K2.6B32.' +
  'B4H.2GL3O3L2R.2G8NK2IH2.2B28.2BMGB7H2OB3R.3L.3L2NF2HJ3H29.2BM2G.2M2.2B2H5BHL4O2LFG4.2BG28.B.MG.G7M4.3B7H5GB2GK28.' +
  'B.MGI.5E8M5.3B4H2BG.D3.H24.B.MG2.5L6E8M2.2G.MB2K5.H24.B.MG2.D4.10L2E4MG2.MBKD5.B24.B.MG2.C4.D9.5L.G.GMBKD30.' +
  'B.MG2.D4.C10.D4.GI.MBKD29.B.MG19.C4.G2.MBKD3.K25.B.MG2.D21.G2.MBK5.G24.B.MG2.C4.D16.G2.MBK3.K2.B23.B.MG2.D4.C10.D4.G5.K5.2B23.' +
  'B.MG2.D15.C4.G2.MBGK3.KB25.B5.11D10.G2.MBG3.K.B.A39.11DG2.MBG58.G2.MBG61.MBG2123.' +
  '601.5A58.14A48.B.6B15A39.2B2I3F3K8B15A30.B2I4.3H3P2N4K7B12A25.BIJ5H2N4K3P2I3H3I2K8B6A22.BI6H8NI.2H2K2O4P.N2I3FKB2.B3A20.' +
  'BF6H8NIJ2H7N2K2I.5H.2BHB3A19.BF5G2L6NI3H9NI3H2.2B.G.2GHB3A17.BF6GL3O3.F3G9NIHJ3H2B2G2.KGBHB2A17.' +
  'B4H2G5L3O3RG6.2NF5H2B.2K3.2KHB3A16.2BM2G7HKLB3RB2L4O2LF4GB3.K2D3.KBHB2A17.2BMGI2M.M2B2H5BH6LF5GB.GK3D3.KGHB2A17.' +
  '2BM3G5L5M3B7H4GBG2.4D3.KG2B2A18.2BM2G5E10L2M3B4HBG.2K3D3.KGB.2A18.2BM3G3C2.3D2.4E5LM2GM2B.2K3D2.K.GB.A20.' +
  '2BM2G3D2.3C8.3D.GIGMB2.2K2D3.GB.2A20.2BM2G.2D13.3C2.2GM2B.2K2D3.G2.A22.B.MG.5C15.3GMB.G2KD2.GB.A23.' +
  'B.MG2.4D11C5.2GM2BG2K2.GB2.A29.M.2M6E5D5C2G.MB2GK5.A28.2G.H2.M5.7E4.G.M2BGK4.A31.G15.5EG2.MBG53.H2.M4.MB60.2G64.G1870.' +
  '726.8A54.18A45.26A37.35A28.40A23.4A4B34A22.2A2B3IH6B29A20.A2BF3IJ4I3P8B22A20.2F6I2N4K3P5I6BA3B.11A18.' +
  'B7I9NF3IJK2.4POB3IH4B8A16.BI6H2O6N2F2I8N2KF6I3H2B6A16.BI5H8OI3H9N2F5I2HBGB2HB5A15.BI5H2O3P3OI3H7O2N6IN2B5G3B4A14.' +
  'BI6H5O3PI2H9OI5HB5.3KG2B4A14.BI5H2N4K2OI3H3O4P2OI4H2BG3K2D.KG3B2A14.BIHJ3H8NI3H2K7OI4HOB.2K4D.2KG2B2A14.' +
  'BI5H8NI2H7N2KI5H2B.2K5D2.GB.A14.BF5H8NIHJH9NI4H2BG2K7D4.A14.BF5G2L6NI2H9NI4HNB2G2K6D.K18.BF5G7LF2.G9NIHJ2H2BG2K7DK19.' +
  'BF5GL3O3LFG.G6L2NF4HNB2G2K6D2K19.5B2G4L3OB3IB7LF4G.B2G2KD5K22.5B3.4BLB3IBL4O2LF4GB.2GK2G3.2G34.2BS2Q2B6LF4G2B5G4B37.' +
  '3Q2.8B3G2BG3B42.Q2.2D3.4D.4B51.3D4.3D1690.1044.4A58.12A50.3A3B16A41.2A2B2.H5B17A.4A29.2AB3.J.3I2O9B17A24.' +
  '2ABF6I2O3P4O.3I6B2A3B8A22.ABF6I2N4K2P3IJ8O2B2.H3B.5A20.ABF6I8NF3I2K2.4PO4.3I2H2B4A18.AB7I8NF3I7N2KF3IJI2HGB2HB3A25.' +
  'H2O6NF3I9NF5IHB5G2B3A16.ABIH3.H8OI2.H9NF5I2B2G3KG3B2A23.2O3P3O3.H7O2N6I.BG.2K2.2K2B2A16.I5.H5O3PIH.9O5.H2.2GK5.K2B.A16.' +
  'I5H2N4K2O3.H3O4P2OI3.H.B.G8.GB.A16.IHJ3H7NI3H2K7O2.H2.O2.G.K25.BI5H8NI3H6N2KI4.H.B9.D3.A15.BF5H8NIHJ9NI4H7.4D.KG18.' +
  'BF5G2L5NI3H9NI4H3.K.3D4K20.BF5G7LF3G8NI2HJHN.G.2KD3KG22.BF5GL3O3LF3G6L2NF4HB.G.4KG2B22.B4.2G4L3OB3IB7LF4G2.2GK2G2B29.' +
  '8BLB3IBL4O2LF4G2B3G2B39.2BS2Q2B6LF4G2BGB44.3Q2.8B3G3B45.3Q13.B1496.1171.3A59.A.3B5A54.B2.I.5B2.7A44.I.J4.I.OH.P7B2.4A2.3A39.' +
  '2O3P4O2.2I3H4B2.3B4A36.4K2PI.J.2O2.4O2P4.4B.A23.ABF17.2K2O4POI3.I.I.2H.BA21.ABF5I2N17.2K3.J3.H4.B.A22.6I8NF2I15.H3.3GB2.A18.' +
  'ABI4.H.O6NF3I6N2.NF7.2G.2KGB.A17.ABI10.3O3.H9NF4INB3.K2.2KB2.A16.ABI4.HO3PO2.OI5.4O2N.5I4.K4.KGB.A19.H3.5O3PI2.HO7.OI3.H12.B.A15.' +
  'ABI4.H2.4K2OI2.3O4P2OI4.O2.G7.KB.A16.ABI.J2.H9.2H2K7OI3.H12.B.A17.I5H2N5.NI2.H6.2K5.O2.G.K2.2D4.A19.5H8NIHJ8.NI.H.H.B.G2.2D.KG29.' +
  'L5NI3H6N2.NI3.H.B3.2D2K24.F3G6.3LF3G8NI2HJHN4.KDKG25.F5GL3O2L.F3GL.4L2N.4H4.3KB27.3B.G4L3O.3I.L14.GK33.8BL.3IBL4O2LFG5.G.B41.' +
  '2BS2.2B6LF4G48.3Q2.7B.3G2B46.3Q10.3B1369.';

function decodeSpriteFrames(delta) {
  const frames = [];
  let prev = new Uint8Array(4096);
  let pos = 0;
  for (let f = 0; f < 26; f++) {
    const cur = prev.slice();
    let i = 0;
    while (i < 4096) {
      let n = 0;
      while (pos < delta.length && delta.charCodeAt(pos) >= 48 && delta.charCodeAt(pos) <= 57) {
        n = n * 10 + (delta.charCodeAt(pos++) - 48);
      }
      const cnt = n || 1;
      const ch = delta[pos++];
      if (ch === '.') i += cnt;
      else {
        cur.fill(ch.charCodeAt(0) - 65, i, i + cnt);
        i += cnt;
      }
    }
    frames.push(cur);
    prev = cur;
  }
  return frames;
}

const RAW_FRAMES = decodeSpriteFrames(CHEST_DELTA);

export const STAGE_WIDTH = 112;
export const STAGE_HEIGHT = 96;
export const REVEAL_FRAME_COUNT = 56;
export const REVEAL_CLIMAX_FRAME = 30;
export const REVEAL_LOOP_START = 28;

const STAGE_BG = '#0a090e';
const SHADOW_BG = '#12111a';

const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  G:['01111','10000','10000','10111','10001','10001','01110'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['111','010','010','010','010','010','111'],
  L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  '*':['00100','10101','01110','11111','01110','10101','00100'],
  ' ':['000','000','000','000','000','000','000'],
};

const COMMON_TORCH_EMBER = [
  '...........kk...........',
  '..........kOOk..........',
  '.........kOYYOk.........',
  '........kOYYYYOk........',
  '.......kOYWWWWYOk.......',
  '.......kOYWWWWYOk.......',
  '......kOYYWWWWYYOk......',
  '......kROYYYYYYORk......',
  '.....kRROOYYYYOORRk.....',
  '.....kRRROOYYOORRRk.....',
  '.....kRRRROOOORRRRk.....',
  '......kRRROOOORRRk......',
  '......kGGGGGGGGGGk......',
  '.....kggYYggggYYggk.....',
  '.....kGGGGGGGGGGGGk.....',
  '......kbbbbbbbbbbk......',
  '.......kBBggggBBk.......',
  '.......kBBBBBBBBk.......',
  '........kBBBBBBk........',
  '........kbbBBbbk........',
  '.........kBBBBk.........',
  '.........kbbbbk.........',
  '..........kbbk..........',
  '...........kk...........',
];
const COMMON_PAL = {
  k:'#21100c', R:'#9a3412', O:'#ea580c', Y:'#fbbf24', W:'#fef9c3',
  G:'#f59e0b', g:'#b45309', B:'#78350f', b:'#451a03',
};

const SHIELD_AEGIS = [
  '........kkkkkkkk........',
  '.....kkkSSSSSSSSkkk.....',
  '...kkSSllllllllllSSkk...',
  '..kSSlbbbbbbbbbbbblSSk..',
  '.kSlbBCCCCCCCCCCCCBblSk.',
  '.kSlbBCCWWWWWWWWCCBblSk.',
  'kSlbBCCWWCCCCCCWWCCBblSk',
  'kSlbBCCWCCCCCCCCWCCBblSk',
  'kSlbBCCCCCCCCCCCCCCBblSk',
  'kSlbBCCCCIIIIIIICCCBblSk',
  'kSlbBCCCCIIIIIIICCCBblSk',
  'kSlbBCCCCCIIIIICCCCBblSk',
  'kSlbBCCCCCCIIICCCCCBblSk',
  'kSmbBBBBBBBBBBBBBBBBbmSk',
  'kSSmbBBCCCCCCCCCCBBbmSSk',
  '.kSmmbbBBBBBBBBBBbbmmSk.',
  '.kSSmmbbbbbbbbbbbbmmSSk.',
  '..kSSmmmbBBBBBBbmmmSSk..',
  '...kkSSmmmmBBmmmmSSkk...',
  '....kkSSmmmmmmmmSSkk....',
  '.....kkSSmmmmmmSSkk.....',
  '.......kkSSmmSSkk.......',
  '........kkSSSSkk........',
  '..........kkkk..........',
];
const SHIELD_PAL = {
  k:'#070e1c', S:'#64748b', l:'#e2e8f0', m:'#475569',
  b:'#075985', B:'#0284c7', C:'#38bdf8', I:'#0369a1', W:'#f0f9ff',
};

const LEGENDARY_CROWN = [
  '...........kk...........',
  '..kk......kYYk......kk..',
  '.kYYk....kYWWYk....kYYk.',
  '.kYGYk...kYMMYk...kYGYk.',
  'kYYGYYk.kYYMMYYk.kYYGYYk',
  'kYYOYYkkYYMMMMYYkkYYOYYk',
  'kYYYYYYYYYYWWYYYYYYYYYYk',
  'kYWOYYYYWWMMMMWWYYYYOWYk',
  'kYYOYYYRMMMMMMMMRYOYYOYk',
  'kYYOYYYRMMMMMMMMRYOYYOYk',
  'kYYOYYYYWWMMMMWWYYYYOYYk',
  'kYYYYYYYYYYYYYYYYYYYYYYk',
  'kOOOOOOOOOOOOOOOOOOOOOOk',
  '.kRRkGGkMMWWWWMMkBBkRRk.',
  '.kRRkGGkMMWWWWMMkBBkRRk.',
  '.kOOOOOOOOOOOOOOOOOOOOk.',
  '..kkkkkkkkkkkkkkkkkkkk..',
];
const LEGENDARY_PAL = {
  k:'#2a1004', Y:'#facc15', W:'#fefce8', O:'#d97706',
  M:'#c084fc', R:'#ef4444', G:'#fde047', B:'#38bdf8',
};

export const CHEST_THEMES = Object.freeze({
  wood: {
    pal: [
      '#000000','#181721','#29211d','#3e2920','#543528',
      '#241a18','#3f2f2b','#5e4740','#806358','#b08f80',
      '#3e1e10','#592d17','#6b381e','#8a4a24','#b56834','#d98f52',
      '#a16207','#f59e0b','#fef08a','#7c2d12','#ea580c','#fb923c','#fef9c3',
    ],
    art: COMMON_TORCH_EMBER,
    artPal: COMMON_PAL,
    label: 'COMMON',
    fg: '#fef08a',
    shadow: '#23110d',
    glowName: 'Warm Amber Pillar + Dust Embers',
  },
  iron: {
    pal: [
      '#000000','#181721','#292632','#443540','#563342',
      '#303340','#515665','#79818e','#a8afba','#d3d4c8',
      '#44312d','#624737','#70503e','#86624a','#ac805b','#cba073',
      '#b17a41','#e4a954','#ffe395','#21565a','#318e86','#7de6b2','#edfff0',
    ],
    art: SHIELD_AEGIS,
    artPal: SHIELD_PAL,
    label: 'SHIELD',
    fg: '#bae6fd',
    shadow: '#09111f',
    glowName: 'Frost Cyan Barrier Rings + Orbiting Orbs',
  },
  gold: {
    pal: [
      '#000000','#181721','#2b1a24','#4a1d32','#632841',
      '#59320a','#8c520d','#c98114','#f5ba2e','#fef08a',
      '#2f0f1d','#4a182d','#5c1e38','#762747','#9c385f','#c45a80',
      '#92400e','#facc15','#fef9c3','#4c1d95','#7c3aed','#c084fc','#f5d0fe',
    ],
    art: LEGENDARY_CROWN,
    artPal: LEGENDARY_PAL,
    label: '* LEGENDARY *',
    fg: '#fef08a',
    shadow: '#2a1004',
    glowName: 'Cosmic Gold & Violet Rays',
  },
});

function normTier(id) {
  return id === 'iron' || id === 'gold' ? id : 'wood';
}

function makeSurface(w, h, fill) {
  const g = new Array(w * h).fill(fill);
  const put = (c, x, y) => {
    const px = Math.round(x), py = Math.round(y);
    if (px >= 0 && px < w && py >= 0 && py < h) g[py * w + px] = c;
  };
  const rect = (c, x, y, rw, rh) => {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + rw), y1 = Math.round(y + rh);
    for (let py = Math.max(0, y0); py < Math.min(h, y1); py++) {
      for (let px = Math.max(0, x0); px < Math.min(w, x1); px++) g[py * w + px] = c;
    }
  };
  return { w, h, g, put, rect };
}

function drawTierChest(r, tier, fIdx, ox, oy, dropY = 0) {
  const pal = CHEST_THEMES[tier].pal;
  const arr = RAW_FRAMES[fIdx];
  for (let y = 0; y < 64; y++) {
    const dy = oy + y + dropY;
    if (dy < 0 || dy >= r.h) continue;
    for (let x = 0; x < 64; x++) {
      const p = arr[y * 64 + x];
      if (p !== 0) r.put(pal[p], ox + x, dy);
    }
  }

  const px = (col, sx, sy) => {
    const dy = oy + sy + dropY;
    if (dy >= 0 && dy < r.h) r.put(col, ox + sx, dy);
  };

  if (tier === 'iron') {
    const lockShift = fIdx <= 1 ? 0 : fIdx <= 3 ? -1 : 0;
    if (fIdx <= 3) {
      px('#0369a1', 23, 44); px('#38bdf8', 24, 44);
      px('#0284c7', 23, 45); px('#bae6fd', 24, 45);
      if (fIdx >= 2) {
        px('#38bdf8', 23, 40 + lockShift); px('#e0f2fe', 24, 40 + lockShift);
      }
    } else {
      px('#0369a1', 23, 44); px('#38bdf8', 24, 44);
      px('#0284c7', 23, 45); px('#7dd3fc', 24, 45);
    }
    px('#e2e8f0', 10, 41); px('#e2e8f0', 38, 41);
  } else if (tier === 'gold') {
    const drawMiniSkull = (sx, sy) => {
      const C = { k:'#140509', g1:'#c98114', g2:'#f5ba2e', g3:'#fef08a', R:'#ff4d6d' };
      const rows = [
        '..k......k..',
        '.k3k....k3k.',
        '.k22k33k22k.',
        '..k233332k..',
        '..k2RkkR2k..',
        '..k1k22k1k..',
        '...k2kk2k...',
        '...k1111k...',
        '....kkkk....',
      ];
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[rx];
          if (ch === '.') continue;
          const col = ch === 'k' ? C.k : ch === '1' ? C.g1 : ch === '2' ? C.g2 : ch === '3' ? C.g3 : C.R;
          px(col, sx + rx, sy + ry);
        }
      });
    };

    if (fIdx <= 3) {
      const lift = fIdx <= 1 ? 0 : -1;
      drawMiniSkull(18, 39 + lift);
    } else {
      px('#ef4444', 23, 44); px('#ff6b8b', 24, 44);
      px('#991b1b', 23, 45); px('#ef4444', 24, 45);
      if (fIdx >= 9 && fIdx <= 11) {
        px('#140509', 23, 11); px('#fef08a', 24, 11); px('#140509', 25, 11);
        px('#140509', 31, 11); px('#fef08a', 32, 11); px('#140509', 33, 11);
        px('#140509', 24, 12); px('#f5ba2e', 25, 12); px('#fef08a', 26, 12); px('#f5ba2e', 27, 12);
        px('#f5ba2e', 28, 12); px('#fef08a', 29, 12); px('#f5ba2e', 30, 12); px('#140509', 31, 12);
        px('#140509', 25, 13); px('#ff4d6d', 26, 13); px('#140509', 27, 13);
        px('#f5ba2e', 28, 13); px('#140509', 29, 13); px('#ff4d6d', 30, 13); px('#140509', 31, 13);
      }
    }
    px('#ef4444', 10, 41); px('#ef4444', 10, 50);
    px('#ef4444', 39, 41); px('#ff6b8b', 38, 49);
  }
}

function drawScaledArt(r, art, palMap, cx, cy, scale) {
  const h = art.length, w = art[0].length;
  if (Number.isInteger(scale)) {
    const dw = w * scale, dh = h * scale;
    const x0 = Math.round(cx - dw / 2), y0 = Math.round(cy - dh / 2);
    for (let sy = 0; sy < h; sy++) {
      const row = art[sy];
      for (let sx = 0; sx < w; sx++) {
        const ch = row[sx];
        if (ch !== '.') r.rect(palMap[ch], x0 + sx * scale, y0 + sy * scale, scale, scale);
      }
    }
    return;
  }
  const dw = Math.round(w * scale), dh = Math.round(h * scale);
  const x0 = Math.round(cx - dw / 2), y0 = Math.round(cy - dh / 2);
  for (let py = 0; py < dh; py++) {
    const row = art[Math.min(h - 1, Math.floor(py / scale))];
    for (let px = 0; px < dw; px++) {
      const ch = row[Math.min(w - 1, Math.floor(px / scale))];
      if (ch !== '.') r.put(palMap[ch], x0 + px, y0 + py);
    }
  }
}

function drawFloorShadow(r, ox, oy, dropY) {
  const cy = oy + 52 + dropY, cx = ox + 32;
  if (cy >= r.h) return;
  for (let y = cy - 5; y <= cy + 6; y++) {
    for (let x = cx - 24; x <= cx + 24; x++) {
      const dx = (x - cx) / 24, dy = (y - cy) / 5.5;
      if (dx * dx + dy * dy <= 1) r.put(SHADOW_BG, x, y);
    }
  }
}

function drawItemBacklight(r, tier, cx, cy, reach, phase, t, climax = 0) {
  for (let y = 0; y < STAGE_HEIGHT; y++) {
    for (let x = 0; x < STAGE_WIDTH; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dEll = Math.sqrt(dx * dx + (dy * 1.25) * (dy * 1.25));

      if (tier === 'wood') {
        let col = STAGE_BG;
        if (reach > 0.02) {
          if (dist < 6 + reach * 38) col = '#17100e';
          if (dist < 4 + reach * 26 + phase * 2) col = '#291710';
          if (reach > 0.35 && Math.abs(dx) < (3 + reach * 9) && y < cy + 30) {
            col = Math.abs(dx) < 5 ? '#572814' : '#3b1d10';
          }
          if (dEll < 3 + reach * 14 + phase * 3) col = '#6b3214';
          if (climax > 0 && dist < 16) col = '#fb923c';
          else if (reach > 0.75 && phase > 0.65 && dist < 22 && (Math.abs(dx) < 3 || Math.abs(dy) < 2)) col = '#9a4718';
        }
        r.put(col, x, y);
      } else if (tier === 'iron') {
        let col = STAGE_BG;
        if (reach > 0.02) {
          if (dist < 8 + reach * 46) col = '#08152b';
          if (dist < 5 + reach * 32 + phase * 3) col = '#0b2547';
          if (dist < 3 + reach * 20 + phase * 4) col = '#113c6e';
          if (reach > 0.25) {
            const ang = Math.atan2(dy, dx);
            const wedge = Math.abs(((ang + t * 0.04) % (Math.PI / 4)) - Math.PI / 8);
            if (dist > 4 && dist < 8 + reach * 44 && wedge < 0.09) col = dist < 26 ? '#0e7490' : '#0b355e';
            if (reach > 0.5) {
              const ring1 = 12 + ((t * 2.2) % 38);
              const ring2 = 12 + (((t * 2.2) + 19) % 38);
              if (Math.abs(dist - ring1) < 1.1 && dist < 8 + reach * 44) col = dist < 34 ? '#38bdf8' : '#0284c7';
              else if (reach > 0.75 && ring2 < 46 && Math.abs(dist - ring2) < 0.95) col = '#0284c7';
            }
          }
          if (climax > 0 && dist < 20) col = climax > 1 ? '#e0f2fe' : '#38bdf8';
          else if (reach > 0.7 && dist < 13 && phase > 0.5) col = '#0369a1';
        }
        r.put(col, x, y);
      } else {
        let col = STAGE_BG;
        if (reach > 0.02) {
          const maxR = 8 + reach * 66;
          if (dist < maxR) col = '#1b0d26';
          if (reach > 0.2) {
            const a1 = Math.atan2(dy, dx) + t * 0.10;
            const a2 = Math.atan2(dy, dx) - t * 0.06;
            const m1 = ((a1 % (Math.PI / 5)) + (Math.PI / 5)) % (Math.PI / 5);
            const m2 = ((a2 % (Math.PI / 6)) + (Math.PI / 6)) % (Math.PI / 6);
            if (m2 < 0.21 && dist > 4 && dist < maxR) col = dist < 42 ? '#4c1d95' : '#2e1065';
            if (m1 < 0.24 && dist > 3 && dist < maxR) col = dist < 34 ? '#b45309' : '#612c09';
            if (dist < 4 + reach * 24 + phase * 4) col = (m1 < 0.22) ? '#eab308' : '#7e22ce';
          }
          if (dist < 2 + reach * 15 + phase * 4) col = '#fde047';
          if (climax > 0 && dist < 24) col = climax > 1 ? '#ffffff' : '#fef9c3';
          else if (reach > 0.8 && dist < 12 && phase > 0.7) col = '#fef9c3';
        }
        r.put(col, x, y);
      }
    }
  }
}

function drawSparkle(r, col, core, x, y, s = 2) {
  r.rect(col, x, y - s, s, s); r.rect(col, x - s, y, s, s);
  r.rect(core, x, y, s, s); r.rect(col, x + s, y, s, s); r.rect(col, x, y + s, s, s);
}

function drawLabel(r, text, y, fg, shadow) {
  const w = [...text].reduce((a, ch) => a + (FONT[ch]?.[0].length || 3) + 1, -1);
  let cx = Math.round((STAGE_WIDTH - w) / 2);
  for (const ch of text) {
    const g = FONT[ch] || FONT[' '];
    for (let ry = 0; ry < g.length; ry++) {
      for (let rx = 0; rx < g[ry].length; rx++) {
        if (g[ry][rx] === '1') {
          r.put(shadow, cx + rx + 1, y + ry + 1);
          r.put(fg, cx + rx, y + ry);
        }
      }
    }
    cx += g[0].length + 1;
  }
}

/** Render a standalone 64x64 transparent chest frame for vault cards. */
export function renderChestPixels(tierId, fIdx = 0) {
  const tier = normTier(tierId);
  const r = makeSurface(64, 64, null);
  drawTierChest(r, tier, fIdx, 0, 0, 0);
  return r.g;
}

/** Render a 112x96 reveal stage frame (0..55) for modal playback and unit verification. */
export function renderRevealFrame(tierId, frameIndex) {
  const tier = normTier(tierId);
  const { art, artPal, label, fg, shadow } = CHEST_THEMES[tier];
  const i = Math.max(0, Math.min(REVEAL_FRAME_COUNT - 1, frameIndex | 0));
  const r = makeSurface(STAGE_WIDTH, STAGE_HEIGHT, STAGE_BG);
  const ox = 24, oy = 20;

  if (i <= 14) {
    drawFloorShadow(r, ox, oy, 0);
    const shake = (i >= 3 && i <= 6) ? (i % 2 === 1 ? -1 : 1) : 0;
    const chestIdx = i <= 2 ? 0 : Math.min(11, i - 1);
    drawTierChest(r, tier, chestIdx, ox + shake, oy, 0);
    if (i >= 11) {
      const glowCol = tier === 'iron' ? '#7dd3fc' : tier === 'gold' ? '#fde047' : '#fbbf24';
      drawSparkle(r, glowCol, '#ffffff', 52, 54 - (i - 11), 1);
    }
  } else if (i <= 27) {
    const p = (i - 15) / 12;
    const itemX = Math.round(52 + Math.min(1, p * 1.4) * 4);
    const itemY = Math.round(52 - Math.sin(p * Math.PI * 0.5) * 11);
    const reach = Math.pow(p, 1.35) * 0.88;
    const chestDrop = i < 19 ? 0 : Math.round(Math.pow((i - 19) / 8, 1.4) * 34);
    const chestFrame = i <= 18 ? 10 : 9;

    drawItemBacklight(r, tier, itemX, itemY, reach, p * 0.8, i, i === 27 ? 1 : 0);
    if (chestDrop < 32) {
      drawFloorShadow(r, ox, oy, chestDrop);
      drawTierChest(r, tier, chestFrame, ox, oy, chestDrop);
    }

    if (i <= 16) {
      const budCol = tier === 'iron' ? '#38bdf8' : tier === 'gold' ? '#facc15' : '#ea580c';
      drawSparkle(r, budCol, '#ffffff', itemX, itemY, 2 + (i - 15));
    } else {
      const scale = i <= 21 ? 1.0 : i <= 25 ? 1.5 : 2;
      drawScaledArt(r, art, artPal, itemX, itemY, scale);
    }
  } else {
    const t = i - 28;
    const climax = t === 0 ? 2 : t === 1 ? 1 : 0;
    const phase = t < 5 ? 1.0 - t * 0.04 : 0.74 + Math.sin(t * 0.45) * 0.14;
    const bobY = t >= 2 ? Math.round(Math.sin(t * 0.5) * 1.5) : 0;

    drawItemBacklight(r, tier, 56, 41, 1.0, phase, i, climax);
    drawScaledArt(r, art, artPal, 56, 41 + bobY, 2);

    if (tier === 'wood') {
      const pts = [[24, 54 - (t % 12), 1], [86, 48 - ((t + 4) % 14), 1], [32, 24 - (t % 8), 1]];
      for (const [sx, sy, ss] of pts) drawSparkle(r, '#ea580c', '#fde047', sx, sy, ss);
    } else if (tier === 'iron') {
      for (let k = 0; k < 4; k++) {
        const a = t * 0.32 + (k * Math.PI) / 2;
        drawSparkle(r, '#38bdf8', '#ffffff', 56 + Math.cos(a) * 34, 41 + Math.sin(a) * 26, 2);
      }
    } else {
      const sparks = [
        [16, 16, '#fde047', 2], [95, 18, '#c084fc', 2], [14, 62, '#38bdf8', 2],
        [96, 60, '#fde047', 2], [26, 36, '#f472b6', 1], [86, 34, '#fef08a', 2],
        [22, 74, '#fde047', 1], [90, 75, '#c084fc', 1],
      ];
      sparks.forEach(([sx, sy, col, ss], idx) => {
        if ((t + idx) % 3 !== 0) drawSparkle(r, col, '#ffffff', sx, sy, ss);
      });
    }

    if (t >= 2) drawLabel(r, label, 82, fg, shadow);
  }

  return r.g;
}

const colorCache = new Map();
function hexToRgbaTuple(hex) {
  if (!hex) return [0, 0, 0, 0];
  let cached = colorCache.get(hex);
  if (!cached) {
    cached = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
      255,
    ];
    colorCache.set(hex, cached);
  }
  return cached;
}

function paintPixels(canvas, pixels, w, h) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b, a] = hexToRgbaTuple(pixels[i]);
    const off = i * 4;
    data[off] = r;
    data[off + 1] = g;
    data[off + 2] = b;
    data[off + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

/** Per-frame millisecond cadence matching the approved 56-frame slow-buildup reveal. */
export function revealFrameDelay(frameIndex) {
  if (frameIndex <= 9) return frameIndex === 0 ? 80 : 95;
  if (frameIndex <= 21) return 95;
  if (frameIndex <= 27) return 90;
  const t = frameIndex - 28;
  return t < 3 ? 80 : 110;
}

/** Build a Vault Card chest stage displaying the crisp 64x64 3/4 pixel chest on the pedestal. */
export function chestArt(chest, opened) {
  const tier = normTier(chest?.id);
  const stage = document.createElement('div');
  stage.className = 'lb-chest-art';
  stage.dataset.tier = tier;
  stage.dataset.open = String(Boolean(opened));
  stage.dataset.style = 'pixel-game';
  stage.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'lb-chest-canvas';
  canvas.width = 64;
  canvas.height = 64;
  paintPixels(canvas, renderChestPixels(tier, opened ? 10 : 0), 64, 64);
  stage.append(canvas);
  return stage;
}

/**
 * Create the 112x96 pixel reveal stage controller for the full-screen modal.
 * Starts sealed at frame 0, advances smoothly through opening buildup into a
 * continuous center-item aura showcase (frames 28..55), and cleans up timers on stop().
 */
export function createRevealStage(chest, opened = false) {
  const tier = normTier(chest?.id);
  const stage = document.createElement('div');
  stage.className = 'lb-chest-art lb-reveal-stage';
  stage.dataset.tier = tier;
  stage.dataset.open = String(Boolean(opened));
  stage.dataset.style = 'pixel-reveal';
  stage.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'lb-reveal-canvas';
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  stage.append(canvas);

  let timer = 0;
  let stopped = false;

  const draw = idx => paintPixels(canvas, renderRevealFrame(tier, idx), STAGE_WIDTH, STAGE_HEIGHT);
  draw(opened ? 34 : 0);

  return {
    stage,
    play({ reducedMotion = false, onClimax } = {}) {
      clearTimeout(timer);
      stopped = false;
      stage.dataset.open = 'true';
      if (reducedMotion) {
        draw(34);
        onClimax?.();
        return;
      }
      let frame = 1;
      let notified = false;
      const tick = () => {
        if (stopped) return;
        draw(frame);
        if (!notified && frame >= REVEAL_CLIMAX_FRAME) {
          notified = true;
          onClimax?.();
        }
        const delay = revealFrameDelay(frame);
        frame = frame >= REVEAL_FRAME_COUNT - 1 ? REVEAL_LOOP_START : frame + 1;
        timer = setTimeout(tick, delay);
      };
      tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
