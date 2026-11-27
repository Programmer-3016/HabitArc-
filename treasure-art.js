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

const IS_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;
const packedColorCache = new Map();
function col32(hex) {
  if (!hex) return 0;
  let v = packedColorCache.get(hex);
  if (v === undefined) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    v = (IS_LITTLE_ENDIAN
      ? (0xff000000 | (b << 16) | (g << 8) | r)
      : ((r << 24) | (g << 16) | (b << 8) | 0xff)) >>> 0;
    packedColorCache.set(hex, v);
  }
  return v;
}
const STAGE_BG_32 = col32(STAGE_BG);
const SHADOW_BG_32 = col32(SHADOW_BG);
const WHITE_32 = col32('#ffffff');

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
  T:['11111','00100','00100','00100','00100','00100','00100'],
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

const LEGENDARY_STAR_PRISM = [
  '...........kk...........',
  '..........kWWk..........',
  '.........kWYYWk.........',
  '........kWYLLYWk........',
  '.......kYYLLLLYYk.......',
  '..kkkkkYYLLLLLLYYkkkkk..',
  '.kWWYYYYYLLWWLLYYYYYWWk.',
  'kWWYYYYYLLWWWWLLYYYYYWWk',
  '.kOOYYYYYLLWWLLYYYYYOOk.',
  '..kkOOYYYYLLLLYYYYOOkk..',
  '....kkOYYYYRRYYYYOkk....',
  '.....kYYYYRRRRYYYYk.....',
  '....kYYOYYkRRkYYOYYk....',
  '...kYYOkk..kk..kkOYYk...',
  '..kOYkk..........kkYOk..',
  '..kkk..............kkk..',
  '........................',
];
const LEGENDARY_PAL = {
  k:'#031e13', Y:'#facc15', W:'#ffffff', O:'#eab308',
  L:'#c4b5fd', R:'#ff4d6d', G:'#47e393', B:'#38bdf8',
};

const PHOENIX_WINGS = [
  '.kk..................kk.',
  'kWWk................kWWk',
  'kYWWkk............kkWWYk',
  'kOYYWWkk........kkWWYYOk',
  'kROOYYWWk......kWWYYOORk',
  '.kRROOYYWk.kk.kWYYOORRk.',
  '.kDRROOYYWkCCkWYYOORRDk.',
  '.kkDRROOYYCMMCYYOORRDkk.',
  '..kDDRROYYCMMCYYORRDDk..',
  '..kkDDRROOYYYYOORRDDkk..',
  '...kDRROOOYWWYOOORRDk...',
  '...kkDDRROYYYYORRDDkk...',
  '....kDRRkkROORkkRRDk....',
  '....kkDk.kRYYRk.kDkk....',
  '.........kOYYOk.........',
  '........kDRYYRDk........',
  '........kDDkkDDk........',
  '.........kk..kk.........',
];
const PHOENIX_PAL = {
  k:'#1f0610', Y:'#facc15', W:'#fef9c3', O:'#f97316',
  R:'#ef4444', D:'#991b1b', M:'#f43f5e', C:'#fff1f2',
};

export const CHEST_THEMES = Object.freeze({
  wood: {
    pal: [
      '#000000','#031e13','#451a03','#78350f','#92400e',
      '#064e3b','#047857','#10b981','#6ee7b7','#ecfdf5',
      '#9a3412','#b45309','#d97706','#f59e0b','#fcd34d','#fef3c7',
      '#b45309','#facc15','#ffffff','#064e3b','#10b981','#47e393','#ffffff',
    ],
    art: COMMON_TORCH_EMBER,
    artPal: COMMON_PAL,
    label: 'SPARK',
    fg: '#fef08a',
    shadow: '#031e13',
    glowName: 'Spark Amber & Emerald-Mint Glow',
  },
  iron: {
    pal: [
      '#000000','#031e13','#022c22','#064e3b','#065f46',
      '#0f172a','#1e293b','#475569','#94a3b8','#f8fafc',
      '#064e3b','#047857','#059669','#10b981','#34d399','#a7f3d0',
      '#0284c7','#38bdf8','#ffffff','#0f172a','#0284c7','#38bdf8','#ffffff',
    ],
    art: SHIELD_AEGIS,
    artPal: SHIELD_PAL,
    label: 'PULSE',
    fg: '#bae6fd',
    shadow: '#031e13',
    glowName: 'Pulse Cyber-Emerald & Cyan Barrier',
  },
  gold: {
    pal: [
      '#000000','#031e13','#1e1b4b','#2e1065','#4c1d95',
      '#713f12','#a16207','#eab308','#facc15','#fef9c3',
      '#4c1d95','#5b21b6','#6d28d9','#8b5cf6','#a78bfa','#ddd6fe',
      '#ca8a04','#facc15','#ffffff','#2e1065','#7c3aed','#c4b5fd','#ffffff',
    ],
    art: LEGENDARY_STAR_PRISM,
    artPal: LEGENDARY_PAL,
    label: '* NOVA *',
    fg: '#fef08a',
    shadow: '#031e13',
    glowName: 'Nova Royal Amethyst & Solar Gold Rays',
  },
  ruby: {
    pal: [
      '#000000','#031e13','#020617','#041311','#08221e',
      '#78350f','#b45309','#f59e0b','#facc15','#fef9c3',
      '#061916','#0b2924','#113c35','#175248','#227062','#5eead4',
      '#059669','#47e393','#ffffff','#022c22','#10b981','#47e393','#ffffff',
    ],
    art: PHOENIX_WINGS,
    artPal: PHOENIX_PAL,
    label: '* APEX *',
    fg: '#a7f3d0',
    shadow: '#031e13',
    glowName: 'Apex Stealth Obsidian & Neon-Mint Rays',
  },
});

function normTier(id) {
  return id === 'iron' || id === 'gold' || id === 'ruby' ? id : 'wood';
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

function drawPatternRows(px, rows, cmap, sx, sy) {
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const col = cmap[row[rx]];
      if (col) px(col, sx + rx, sy + ry);
    }
  }
}

function paintTierChestOverlay(r, tier, fIdx, ox, oy, dropY = 0) {
  const px = (col, sx, sy) => {
    const dy = oy + sy + dropY;
    if (dy >= 0 && dy < r.h) r.put(r.is32 ? col32(col) : col, ox + sx, dy);
  };

  if (tier === 'wood') {
    const lift = fIdx >= 2 && fIdx <= 3 ? -1 : 0;
    px('#059669', 23, 44 + lift); px('#47e393', 24, 44 + lift);
    px('#10b981', 23, 45 + lift); px('#a7f3d0', 24, 45 + lift);
    px('#fef9c3', 10, 41); px('#fef9c3', 38, 41);
  } else if (tier === 'iron') {
    const lockShift = fIdx <= 1 ? 0 : fIdx <= 3 ? -1 : 0;
    if (fIdx <= 3) {
      px('#0369a1', 23, 44); px('#38bdf8', 24, 44);
      px('#10b981', 23, 45); px('#47e393', 24, 45);
      if (fIdx >= 2) {
        px('#47e393', 23, 40 + lockShift); px('#ecfeff', 24, 40 + lockShift);
      }
    } else {
      px('#0369a1', 23, 44); px('#38bdf8', 24, 44);
      px('#10b981', 23, 45); px('#47e393', 24, 45);
    }
    px('#ffffff', 10, 41); px('#ffffff', 38, 41);
  } else if (tier === 'gold') {
    const cmap = { k:'#031e13', 1:'#ca8a04', 2:'#facc15', 3:'#fef9c3', R:'#ff4d6d', W:'#ffffff' };
    const starCrestRows = [
      '.kk......kk.',
      'k32k.kk.k23k',
      '.k23k33k32k.',
      '..k23WW32k..',
      '..k2WRRW2k..',
      '..k12RR21k..',
      '...k1221k...',
      '....kkkk....',
    ];
    if (fIdx <= 3) {
      const lift = fIdx <= 1 ? 0 : -1;
      drawPatternRows(px, starCrestRows, cmap, 18, 40 + lift);
    } else {
      px('#ff4d6d', 23, 44); px('#fda4af', 24, 44);
      px('#be123c', 23, 45); px('#ff4d6d', 24, 45);
    }
    px('#fef9c3', 10, 41); px('#c4b5fd', 10, 50);
    px('#fef9c3', 39, 41); px('#c4b5fd', 38, 49);
  } else if (tier === 'ruby') {
    const cmap = {
      k:'#031e13', 1:'#b45309', 2:'#f59e0b', 3:'#fef9c3',
      R:'#47e393', S:'#ffffff', C:'#facc15',
    };
    const leftHandle = [
      '..kkk.',
      '.k321k',
      'k32kk.',
      'k21k..',
      'k21k..',
      'k12kk.',
      '.k21k.',
      '..kkk.',
    ];
    const rightHandle = [
      '.kkk..',
      'k232k.',
      '.k212k',
      '..k12k',
      '..k12k',
      '.k212k',
      'k121k.',
      '.kkk..',
    ];
    drawPatternRows(px, leftHandle, cmap, 4, 39);
    drawPatternRows(px, rightHandle, cmap, 49, 39);

    if (fIdx <= 3) {
      const lift = fIdx <= 1 ? 0 : -1;
      const leftHorn = [
        'kk...',
        'k3k..',
        'k23k.',
        '.k12k',
        '..kkk',
      ];
      const rightHorn = [
        '...kk',
        '..k3k',
        '.k32k',
        'k21k.',
        'kkk..',
      ];
      drawPatternRows(px, leftHorn, cmap, 15, 16);
      drawPatternRows(px, rightHorn, cmap, 35, 18);
      const dragonClasp = [
        '.kk..........kk.',
        'k32k........k23k',
        'k232k..kk..k232k',
        '.k123kk33kk321k.',
        '..k1223333221k..',
        '..k2RSk22kSR2k..',
        '..k122kSSk221k..',
        '...k12kCCk21k...',
        '...k23RRRR32k...',
        '....k1k22k1k....',
        '.....k2kk2k.....',
        '.....k1111k.....',
        '......kkkk......',
      ];
      drawPatternRows(px, dragonClasp, cmap, 16, 36 + lift);
    } else {
      const keyhole = [
        'k33k',
        'kCRk',
        'kRSk',
        'k12k',
      ];
      drawPatternRows(px, keyhole, cmap, 22, 42);
      if (fIdx >= 9 && fIdx <= 11) {
        const lidCrest = [
          'kk..........kk',
          'k3k..kkkk..k3k',
          'k23kk2332kk32k',
          '.k122RkkR221k.',
          '..k1k2RR2k1k..',
          '....kkkkkk....',
        ];
        drawPatternRows(px, lidCrest, cmap, 25, 10);
      }
    }
    for (const [rx, ry, col] of [
      [10, 39, '#fef08a'], [10, 49, '#fb7185'], [38, 39, '#fef08a'], [38, 50, '#f59e0b'],
      [14, 51, '#fbbf24'], [20, 52, '#ff2e63'], [28, 52, '#fbbf24'], [34, 52, '#ff2e63'],
      [48, 34, '#fbbf24'], [46, 47, '#ff2e63'],
    ]) px(col, rx, ry);
  }
}

function drawTierChest(r, tier, fIdx, ox, oy, dropY = 0) {
  const pal = r.is32
    ? (CHEST_THEMES[tier].pal32 || (CHEST_THEMES[tier].pal32 = CHEST_THEMES[tier].pal.map(col32)))
    : CHEST_THEMES[tier].pal;
  const arr = RAW_FRAMES[fIdx];
  for (let y = 0; y < 64; y++) {
    const dy = oy + y + dropY;
    if (dy < 0 || dy >= r.h) continue;
    for (let x = 0; x < 64; x++) {
      const p = arr[y * 64 + x];
      if (p !== 0) r.put(pal[p], ox + x, dy);
    }
  }
  paintTierChestOverlay(r, tier, fIdx, ox, oy, dropY);
}

function drawScaledArt(r, art, palMap, cx, cy, scale) {
  const h = art.length, w = art[0].length;
  const resolveCol = ch => r.is32 ? col32(palMap[ch]) : palMap[ch];
  if (Number.isInteger(scale)) {
    const dw = w * scale, dh = h * scale;
    const x0 = Math.round(cx - dw / 2), y0 = Math.round(cy - dh / 2);
    for (let sy = 0; sy < h; sy++) {
      const row = art[sy];
      for (let sx = 0; sx < w; sx++) {
        const ch = row[sx];
        if (ch !== '.') r.rect(resolveCol(ch), x0 + sx * scale, y0 + sy * scale, scale, scale);
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
      if (ch !== '.') r.put(resolveCol(ch), x0 + px, y0 + py);
    }
  }
}

function drawFloorShadow(r, ox, oy, dropY, shrink = 0) {
  const cy = oy + 52 + dropY, cx = ox + 32;
  if (cy - 5 >= r.h) return;
  const rx = Math.max(12, 24 - shrink);
  const ry = Math.max(2.5, 5.5 - shrink * 0.25);
  const invRx2 = 1 / (rx * rx), invRy2 = 1 / (ry * ry);
  const shadowCol = r.is32 ? SHADOW_BG_32 : SHADOW_BG;
  const xMin = Math.max(0, Math.floor(cx - rx)), xMax = Math.min(r.w - 1, Math.ceil(cx + rx));
  const yMin = Math.max(0, Math.floor(cy - ry)), yMax = Math.min(r.h - 1, Math.ceil(cy + ry));
  for (let y = yMin; y <= yMax; y++) {
    const dy2 = (y - cy) * (y - cy) * invRy2;
    for (let x = xMin; x <= xMax; x++) {
      const dx = x - cx;
      if (dx * dx * invRx2 + dy2 <= 1) r.put(shadowCol, x, y);
    }
  }
}

const polarLutCache = new Map();
function getPolarLut(gw, gh, heroY) {
  const key = gw + 'x' + gh + ':' + heroY;
  let lut = polarLutCache.get(key);
  if (lut) return lut;
  const padX = 12, padY = 32;
  const lutW = gw + padX * 2, lutH = gh + padY * 2;
  const cxL = Math.round(gw / 2) + padX, cyL = heroY + padY;
  const len = lutW * lutH;
  const dist = new Float32Array(len);
  const dEll = new Float32Array(len);
  const angUnit = new Float32Array(len);
  const inv2Pi = 1 / (Math.PI * 2);
  for (let y = 0; y < lutH; y++) {
    const dy = y - cyL;
    const dyE = dy * 1.25;
    for (let x = 0; x < lutW; x++) {
      const dx = x - cxL;
      const idx = y * lutW + x;
      dist[idx] = Math.sqrt(dx * dx + dy * dy);
      dEll[idx] = Math.sqrt(dx * dx + dyE * dyE);
      angUnit[idx] = (Math.atan2(dy, dx) + Math.PI) * inv2Pi;
    }
  }
  lut = { gw, gh, heroY, cx0: Math.round(gw / 2), padX, padY, lutW, dist, dEll, angUnit };
  if (polarLutCache.size > 4) polarLutCache.clear();
  polarLutCache.set(key, lut);
  return lut;
}

const BACKLIGHT_COLS_HEX = {
  wood: ['#17100e', '#291710', '#3b1d10', '#572814', '#6b3214', '#9a4718', '#fb923c'],
  iron: ['#08152b', '#0b2547', '#113c6e', '#0b355e', '#0e7490', '#0284c7', '#38bdf8', '#0369a1', '#e0f2fe'],
  gold: ['#1b0d26', '#2e1065', '#4c1d95', '#612c09', '#b45309', '#7e22ce', '#eab308', '#fde047', '#fef9c3', '#ffffff'],
  ruby: ['#18050d', '#2b0716', '#4a0c23', '#7c2d12', '#991b1b', '#881337', '#b45309', '#be123c', '#fda4af', '#ffffff'],
};
const BACKLIGHT_COLS_32 = Object.fromEntries(
  Object.entries(BACKLIGHT_COLS_HEX).map(([k, arr]) => [k, arr.map(col32)])
);

function drawItemBacklight(r, tier, cx, cy, reach, phase, t, climax = 0, lut = null) {
  if (reach <= 0.02) {
    if (r.is32) r.buf.fill(STAGE_BG_32);
    return;
  }
  const gw = r.w, gh = r.h;
  const heroY = gh === STAGE_HEIGHT ? 41 : Math.round(gh * 0.43);
  const polar = lut || getPolarLut(gw, gh, heroY);
  const offX = polar.padX - (cx - polar.cx0);
  const offY = polar.padY - (cy - polar.heroY);
  const lutW = polar.lutW, distArr = polar.dist, dEllArr = polar.dEll, angArr = polar.angUnit;
  const unit = Math.min(gw, gh) / STAGE_HEIGHT;
  const maxCorner = Math.ceil(Math.hypot(Math.max(cx, gw - cx), Math.max(cy, gh - cy))) + 6;
  const cols = r.is32 ? BACKLIGHT_COLS_32[tier] : BACKLIGHT_COLS_HEX[tier];
  const bg = r.is32 ? STAGE_BG_32 : STAGE_BG;
  const dst = r.is32 ? r.buf : r.g;

  if (tier === 'wood') {
    const rOuter = (6 + reach * 38) * unit;
    const rMid = (4 + reach * 26 + phase * 2) * unit;
    const pilHalf = (3 + reach * 9) * unit, pilInner = 5 * unit, pilBot = cy + 36 * unit;
    const rEll = (3 + reach * 14 + phase * 3) * unit;
    const flash = climax > 0 ? 16 * unit : 0;
    const cross = reach > 0.75 && phase > 0.65;
    const crossR = 22 * unit, crossX = 3 * unit, crossY = 2 * unit;

    for (let y = 0; y < gh; y++) {
      const dyAbs = Math.abs(y - cy), dyOk = y < pilBot;
      const rowL = (y + offY) * lutW + offX, rowD = y * gw;
      for (let x = 0; x < gw; x++) {
        const li = rowL + x, d = distArr[li], dE = dEllArr[li], dxAbs = Math.abs(x - cx);
        let c = bg;
        if (d < rOuter) c = cols[0];
        if (d < rMid) c = cols[1];
        if (reach > 0.35 && dxAbs < pilHalf && dyOk) c = dxAbs < pilInner ? cols[3] : cols[2];
        if (dE < rEll) c = cols[4];
        if (flash > 0 && d < flash) c = cols[6];
        else if (cross && d < crossR && (dxAbs < crossX || dyAbs < crossY)) c = cols[5];
        dst[rowD + x] = c;
      }
    }
  } else if (tier === 'iron') {
    const maxFrost = Math.max((8 + reach * 46) * unit, reach * maxCorner * 0.85);
    const r2 = (5 + reach * 32 + phase * 3) * unit;
    const r3 = (3 + reach * 20 + phase * 4) * unit;
    const rWedgeMax = Math.max((8 + reach * 44) * unit, reach * maxCorner * 0.92);
    const rRingMax = (8 + reach * 44) * unit;
    const u4 = 4 * unit, u26 = 26 * unit, u34 = 34 * unit;
    const rotW = (t * 0.04 * 8) / (Math.PI * 2);
    const span = 42 * unit;
    const ring1 = 12 * unit + ((t * 2.2 * unit) % span);
    const ring2 = 12 * unit + (((t * 2.2 + 19) * unit) % span);
    const r1Tol = 1.25 * unit, r2Tol = 1.05 * unit, r2Lim = 48 * unit;
    const flash = climax > 0 ? 20 * unit : 0, flashCol = climax > 1 ? cols[8] : cols[6];
    const core = reach > 0.7 && phase > 0.5 ? 13 * unit : 0;

    for (let y = 0; y < gh; y++) {
      const rowL = (y + offY) * lutW + offX, rowD = y * gw;
      for (let x = 0; x < gw; x++) {
        const li = rowL + x, d = distArr[li];
        let c = bg;
        if (d < maxFrost) c = cols[0];
        if (d < r2) c = cols[1];
        if (d < r3) c = cols[2];
        if (reach > 0.25) {
          let w = angArr[li] * 8 + rotW;
          w -= Math.floor(w);
          if (d > u4 && d < rWedgeMax && Math.abs(w - 0.5) < 0.115) c = d < u26 ? cols[4] : cols[3];
          if (reach > 0.5) {
            if (Math.abs(d - ring1) < r1Tol && d < rRingMax) c = d < u34 ? cols[6] : cols[5];
            else if (reach > 0.75 && ring2 < r2Lim && Math.abs(d - ring2) < r2Tol) c = cols[5];
          }
        }
        if (flash > 0 && d < flash) c = flashCol;
        else if (core > 0 && d < core) c = cols[7];
        dst[rowD + x] = c;
      }
    }
  } else if (tier === 'ruby') {
    const maxR = 10 + reach * maxCorner;
    const rInner = (6 + reach * 34 + phase * 3) * unit;
    const rCore = (5 + reach * 21 + phase * 3) * unit;
    const rSun = (3 + reach * 13 + phase * 3) * unit;
    const rot1 = (t * 0.08 * 7) / (Math.PI * 2);
    const rot2 = (t * 0.05 * 10) / (Math.PI * 2);
    const span = 44 * unit;
    const ring = 14 * unit + ((t * 2.4 * unit) % span);
    const u3 = 3 * unit, u38 = 38 * unit, u50 = 50 * unit, ringTol = 1.4 * unit;
    const flash = climax > 0 ? 26 * unit : 0, flashCol = climax > 1 ? cols[9] : cols[8];

    for (let y = 0; y < gh; y++) {
      const rowL = (y + offY) * lutW + offX, rowD = y * gw;
      for (let x = 0; x < gw; x++) {
        const li = rowL + x, d = distArr[li];
        let c = bg;
        if (d < maxR) c = cols[0];
        if (d < rInner) c = cols[1];
        let m1 = 1;
        if (reach > 0.2) {
          m1 = angArr[li] * 7 + rot1;
          let m2 = angArr[li] * 10 - rot2;
          m1 -= Math.floor(m1);
          m2 -= Math.floor(m2);
          if (m2 < 0.34 && d > u3 && d < maxR) c = d < u50 ? cols[4] : cols[2];
          if (m1 < 0.32 && d > u3 && d < maxR) c = d < u38 ? cols[6] : cols[3];
          if (reach > 0.45 && Math.abs(d - ring) < ringTol && d < maxR) c = cols[7];
        }
        if (d < rCore) c = m1 < 0.36 ? cols[3] : cols[5];
        if (d < rSun) c = cols[2];
        if (flash > 0 && d < flash) c = flashCol;
        dst[rowD + x] = c;
      }
    }
  } else {
    const maxR = 8 + reach * maxCorner;
    const rCore = (4 + reach * 24 + phase * 4) * unit;
    const rSun = (2 + reach * 15 + phase * 4) * unit;
    const rot1 = (t * 0.10 * 5) / (Math.PI * 2);
    const rot2 = (t * 0.06 * 6) / (Math.PI * 2);
    const u3 = 3 * unit, u4 = 4 * unit, u36 = 36 * unit, u44 = 44 * unit;
    const flash = climax > 0 ? 24 * unit : 0, flashCol = climax > 1 ? cols[9] : cols[8];
    const hotCore = reach > 0.8 && phase > 0.7 ? 12 * unit : 0;

    for (let y = 0; y < gh; y++) {
      const rowL = (y + offY) * lutW + offX, rowD = y * gw;
      for (let x = 0; x < gw; x++) {
        const li = rowL + x, d = distArr[li];
        let c = bg;
        if (d < maxR) c = cols[0];
        if (reach > 0.2) {
          let m1 = angArr[li] * 5 + rot1;
          let m2 = angArr[li] * 6 - rot2;
          m1 -= Math.floor(m1);
          m2 -= Math.floor(m2);
          if (m2 < 0.401 && d > u4 && d < maxR) c = d < u44 ? cols[2] : cols[1];
          if (m1 < 0.382 && d > u3 && d < maxR) c = d < u36 ? cols[4] : cols[3];
          if (d < rCore) c = m1 < 0.35 ? cols[6] : cols[5];
        }
        if (d < rSun) c = cols[7];
        if (flash > 0 && d < flash) c = flashCol;
        else if (hotCore > 0 && d < hotCore) c = cols[8];
        dst[rowD + x] = c;
      }
    }
  }
}

function paintRevealScene(r, tier, state, lut = null) {
  const { art, artPal, label, fg, shadow } = CHEST_THEMES[tier];
  const gw = r.w, gh = r.h;
  const cx = Math.round(gw / 2);
  const heroY = gh === STAGE_HEIGHT ? 41 : Math.round(gh * 0.43);
  const ox = cx - 32;
  const oy = heroY - 21;
  const mouthY = oy + 32;
  const unit = Math.min(gw, gh) / STAGE_HEIGHT;
  const C = (hex) => (r.is32 ? col32(hex) : hex);

  if (state.mode === 'idle') {
    if (r.is32) r.buf.fill(STAGE_BG_32);
    const jumpY = state.jumpY || 0;
    const shakeX = state.shakeX || 0;
    drawFloorShadow(r, ox, oy, 0, Math.abs(jumpY));
    drawTierChest(r, tier, 0, ox + shakeX, oy + jumpY, 0);
    return;
  }

  if (state.mode === 'open-lid') {
    if (r.is32) r.buf.fill(STAGE_BG_32);
    drawFloorShadow(r, ox, oy, 0, 0);
    drawTierChest(r, tier, state.chestIdx, ox + (state.shakeX || 0), oy, 0);
    if (state.spark > 0) {
      const glowCol = tier === 'iron' ? '#7dd3fc' : tier === 'ruby' ? '#fb7185' : tier === 'gold' ? '#fde047' : '#fbbf24';
      drawSparkle(r, C(glowCol), C('#ffffff'), cx - 4, mouthY + 2 - state.spark, 1);
    }
    return;
  }

  if (state.mode === 'rising') {
    const p = state.p;
    const itemX = Math.round((cx - 4) + Math.min(1, p * 1.4) * 4);
    const itemY = Math.round(mouthY - Math.sin(p * Math.PI * 0.5) * (mouthY - heroY));
    const reach = Math.pow(p, 1.35) * 0.88;
    const dropSpan = Math.max(34, gh - (oy + 16));
    const chestDrop = p < 0.30 ? 0 : Math.round(Math.pow((p - 0.30) / 0.70, 1.4) * dropSpan);
    const chestFrame = p < 0.30 ? 10 : 9;

    drawItemBacklight(r, tier, itemX, itemY, reach, p * 0.8, 15 + p * 12, state.climax || 0, lut);
    if (chestDrop < dropSpan - 2) {
      drawFloorShadow(r, ox, oy, chestDrop, 0);
      drawTierChest(r, tier, chestFrame, ox, oy, chestDrop);
    }

    if (p < 0.14) {
      const budCol = tier === 'iron' ? '#38bdf8' : tier === 'ruby' ? '#fb7185' : tier === 'gold' ? '#facc15' : '#ea580c';
      drawSparkle(r, C(budCol), C('#ffffff'), itemX, itemY, 2 + (p > 0.07 ? 1 : 0));
    } else {
      const scale = p < 0.48 ? 1.0 : p < 0.82 ? 1.5 : 2;
      drawScaledArt(r, art, artPal, itemX, itemY, scale);
    }
    return;
  }

  const t = state.t;
  const climax = t < 1 ? 2 : t < 2 ? 1 : 0;
  const phase = t < 5 ? 1.0 - t * 0.04 : 0.74 + Math.sin(t * 0.45) * 0.14;
  const bobY = t >= 2 ? Math.round(Math.sin(t * 0.5) * 1.5) : 0;

  drawItemBacklight(r, tier, cx, heroY, 1.0, phase, 28 + t, climax, lut);
  drawScaledArt(r, art, artPal, cx, heroY + bobY, 2);

  const ti = Math.floor(t);
  if (tier === 'wood') {
    const pts = [
      [cx - Math.round(32 * unit), heroY + 13 - (ti % 12), 1],
      [cx + Math.round(30 * unit), heroY + 7 - ((ti + 4) % 14), 1],
      [cx - Math.round(24 * unit), heroY - 17 - (ti % 8), 1],
    ];
    for (const [sx, sy, ss] of pts) drawSparkle(r, C('#ea580c'), C('#fde047'), sx, sy, ss);
  } else if (tier === 'iron') {
    for (let k = 0; k < 4; k++) {
      const a = t * 0.32 + (k * Math.PI) / 2;
      drawSparkle(r, C('#38bdf8'), C('#ffffff'), cx + Math.cos(a) * (34 * unit), heroY + Math.sin(a) * (26 * unit), 2);
    }
  } else if (tier === 'ruby') {
    const dx = 38 * unit, dy = 24 * unit;
    for (let k = 0; k < 6; k++) {
      const a = t * 0.28 + (k * Math.PI) / 3;
      const sx = cx + Math.cos(a) * (k % 2 ? dx : dx * 0.78);
      const sy = heroY + Math.sin(a) * (k % 2 ? dy : dy * 0.78);
      drawSparkle(r, C(k % 2 ? '#fb7185' : '#facc15'), C('#ffffff'), sx, sy, k % 2 ? 2 : 1);
    }
  } else {
    const dx = 36 * unit, dy = 24 * unit;
    const sparks = [
      [cx - dx, heroY - dy, '#fde047', 2], [cx + dx, heroY - dy, '#c084fc', 2],
      [cx - dx - 4, heroY + dy, '#38bdf8', 2], [cx + dx + 4, heroY + dy, '#fde047', 2],
      [cx - dx * 0.7, heroY - 4, '#f472b6', 1], [cx + dx * 0.7, heroY - 6, '#fef08a', 2],
      [cx - dx * 0.85, heroY + dy + 10, '#fde047', 1], [cx + dx * 0.85, heroY + dy + 11, '#c084fc', 1],
    ];
    sparks.forEach(([sx, sy, col, ss], idx) => {
      if ((ti + idx) % 3 !== 0) drawSparkle(r, C(col), C('#ffffff'), sx, sy, ss);
    });
  }

  const labelY = gh === STAGE_HEIGHT ? 82 : Math.min(gh - 10, heroY + 29);
  if (t >= 2) drawLabel(r, label, labelY, C(fg), C(shadow));
}

function drawSparkle(r, col, core, x, y, s = 2) {
  r.rect(col, x, y - s, s, s); r.rect(col, x - s, y, s, s);
  r.rect(core, x, y, s, s); r.rect(col, x + s, y, s, s); r.rect(col, x, y + s, s, s);
}

function drawLabel(r, text, y, fg, shadow) {
  const w = [...text].reduce((a, ch) => a + (FONT[ch]?.[0].length || 3) + 1, -1);
  let cx = Math.round((r.w - w) / 2);
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

/** Compute crisp fullscreen pixel-grid dimensions that fit any phone or desktop viewport. */
export function computeStageDimensions(vw = STAGE_WIDTH, vh = STAGE_HEIGHT) {
  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw < 180 || vh < 180) {
    return { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  }
  const pxScale = Math.max(3, Math.min(7, Math.floor(vh / 128), Math.floor(vw / 96)));
  return {
    width: Math.max(96, Math.ceil(vw / pxScale)),
    height: Math.max(STAGE_HEIGHT, Math.ceil(vh / pxScale)),
  };
}

/** Render a standalone 64x64 transparent chest frame for vault cards. */
export function renderChestPixels(tierId, fIdx = 0) {
  const tier = normTier(tierId);
  const r = makeSurface(64, 64, null);
  drawTierChest(r, tier, fIdx, 0, 0, 0);
  return r.g;
}

/** Render a deterministic reveal stage frame (0..55) for tests and static checks. */
export function renderRevealFrame(tierId, frameIndex, gw = STAGE_WIDTH, gh = STAGE_HEIGHT) {
  const tier = normTier(tierId);
  const i = Math.max(0, Math.min(REVEAL_FRAME_COUNT - 1, frameIndex | 0));
  const r = makeSurface(gw, gh, STAGE_BG);
  let state;
  if (i <= 14) {
    state = {
      mode: 'open-lid',
      chestIdx: i <= 2 ? 0 : Math.min(11, i - 1),
      shakeX: (i >= 3 && i <= 6) ? (i % 2 === 1 ? -1 : 1) : 0,
      spark: i >= 11 ? i - 10 : 0,
    };
  } else if (i <= 27) {
    state = { mode: 'rising', p: (i - 15) / 12, climax: i === 27 ? 1 : 0 };
  } else {
    state = { mode: 'showcase', t: i - 28 };
  }
  paintRevealScene(r, tier, state);
  return r.g;
}

/** Map sealed idle elapsed ms to a lively hop-and-wiggle chest pose. */
export function sealedIdlePose(elapsedMs) {
  const cycle = 1150;
  const p = ((elapsedMs % cycle) + cycle) % cycle / cycle;
  if (p < 0.28) return { mode: 'idle', jumpY: 0, shakeX: 0 };
  if (p < 0.36) return { mode: 'idle', jumpY: 0, shakeX: p < 0.32 ? -1 : 1 };
  if (p < 0.44) return { mode: 'idle', jumpY: 1, shakeX: p < 0.40 ? -1 : 0 };
  if (p < 0.80) {
    const s = (p - 0.44) / 0.36;
    const jumpY = -Math.round(Math.sin(s * Math.PI) * 5);
    const shakeX = (s > 0.22 && s < 0.78) ? (s < 0.5 ? -1 : 1) : 0;
    return { mode: 'idle', jumpY, shakeX };
  }
  if (p < 0.90) return { mode: 'idle', jumpY: 1, shakeX: 0 };
  return { mode: 'idle', jumpY: 0, shakeX: 0 };
}

function makeSurface32(w, h, buf32) {
  const put = (c32, x, y) => {
    const px = Math.round(x), py = Math.round(y);
    if (px >= 0 && px < w && py >= 0 && py < h) buf32[py * w + px] = c32;
  };
  const rect = (c32, x, y, rw, rh) => {
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + rw), y1 = Math.round(y + rh);
    for (let py = Math.max(0, y0); py < Math.min(h, y1); py++) {
      const row = py * w;
      for (let px = Math.max(0, x0); px < Math.min(w, x1); px++) buf32[row + px] = c32;
    }
  };
  return { is32: true, w, h, buf: buf32, put, rect };
}

/** Per-frame millisecond cadence matching the 56-frame buildup timing reference. */
export function revealFrameDelay(frameIndex) {
  if (frameIndex <= 9) return frameIndex === 0 ? 80 : 95;
  if (frameIndex <= 21) return 95;
  if (frameIndex <= 27) return 90;
  const t = frameIndex - 28;
  return t < 3 ? 80 : 110;
}

const BG_W = 96;
const BG_H = 54;
let cachedVaultBg = null;

function buildVaultBackdrop32() {
  if (cachedVaultBg) return cachedVaultBg;
  const buf = new Uint32Array(BG_W * BG_H);
  const r = makeSurface32(BG_W, BG_H, buf);
  const C = col32;

  // Clean HabitArc midnight-violet sky transitioning softly into dusk horizon glow
  const skyBands = [
    [0, 10, '#130f22'],
    [10, 19, '#191330'],
    [19, 27, '#221840'],
    [27, 33, '#2b1e50'],
    [33, 38, '#372663'],
  ];
  for (const [y0, y1, hex] of skyBands) r.rect(C(hex), 0, y0, BG_W, y1 - y0);

  // Subtle checkerboard pixel dither softening sky horizon steps
  for (let x = 0; x < BG_W; x++) {
    if (x % 2 === 0) r.put(C('#191330'), x, 9);
    if (x % 2 === 1) r.put(C('#221840'), x, 18);
    if (x % 2 === 0) r.put(C('#2b1e50'), x, 26);
    if (x % 2 === 1) r.put(C('#372663'), x, 32);
  }

  // Calm twinkling twilight stars placed away from top corners so corner pills stay legible
  for (const [sx, sy, hex] of [
    [28, 7, '#c4b5fd'], [40, 5, '#fef9c3'], [53, 8, '#ddd6fe'], [66, 6, '#c4b5fd'],
    [14, 17, '#a78bfa'], [34, 15, '#ddd6fe'], [61, 14, '#fef9c3'], [80, 18, '#c4b5fd'],
    [21, 24, '#c4b5fd'], [47, 20, '#a78bfa'], [73, 25, '#ddd6fe'], [88, 22, '#a78bfa'],
    [9, 29, '#c4b5fd'], [85, 31, '#c4b5fd'],
  ]) r.put(C(hex), sx, sy);
  // Two crisp tiny 4-pixel star glints flanking center sky
  for (const [gx, gy] of [[25, 13], [70, 12]]) {
    r.put(C('#fef9c3'), gx, gy);
    r.put(C('#c4b5fd'), gx - 1, gy);
    r.put(C('#c4b5fd'), gx + 1, gy);
    r.put(C('#c4b5fd'), gx, gy - 1);
    r.put(C('#c4b5fd'), gx, gy + 1);
  }

  // Smooth carved twilight stone platform & beveled dais (zero harsh stripes or busy grids)
  r.rect(C('#54447d'), 0, 38, BG_W, 1);
  r.rect(C('#3c305c'), 0, 39, BG_W, 1);
  r.rect(C('#2d2446'), 0, 40, BG_W, 4);
  r.rect(C('#251e3b'), 0, 44, BG_W, 3);
  // Subtle wide outer chamfer highlights near edges of dais slab
  r.rect(C('#47396b'), 4, 38, 18, 1);
  r.rect(C('#47396b'), BG_W - 22, 38, 18, 1);
  // Crisp stone front plinth riser & base grounding
  r.rect(C('#171226'), 0, 47, BG_W, 1);
  r.rect(C('#201933'), 0, 48, BG_W, 3);
  r.rect(C('#191329'), 0, 51, BG_W, 2);
  r.rect(C('#130e20'), 0, 53, BG_W, 1);
  // Restrained architectural joint marks far left & right only
  for (const jx of [18, BG_W - 19]) {
    r.rect(C('#171226'), jx, 48, 1, 5);
  }

  // Crisp feathered 2-tone pixel shadow oval beneath chest center
  const scx = 48, scy = 43;
  for (let y = 40; y <= 46; y++) {
    for (let x = 28; x <= 68; x++) {
      const dx = (x - scx) / 18;
      const dy = (y - scy) / 3.1;
      const dist = dx * dx + dy * dy;
      if (dist <= 0.62) r.put(C('#100c1b'), x, y);
      else if (dist <= 1) r.put(C('#191329'), x, y);
    }
  }

  cachedVaultBg = buf;
  return buf;
}

const CARD_ANIM_PAL = Object.freeze({
  wood: Object.freeze({ primary: '#fb923c', secondary: '#fde047', gem: '#fef08a' }),
  iron: Object.freeze({ primary: '#38bdf8', secondary: '#7dd3fc', gem: '#e0f2fe' }),
  gold: Object.freeze({ primary: '#facc15', secondary: '#c084fc', gem: '#fef9c3' }),
  ruby: Object.freeze({ primary: '#fb7185', secondary: '#facc15', gem: '#ffe4e6' }),
});
const CARD_TIER_OFFSET = Object.freeze({ wood: 0, iron: 260, gold: 520, ruby: 780 });

/**
 * Render one 64x64 transparent animated Vault Card chest frame for tests and 20fps card canvases.
 * - ready: eager bouncy hop + peeking lid + twinkling tier sparkles
 * - collected / equipped: proudly open chest streaming floating treasure embers & lock glints
 * - locked: gentle idle slumber shimmer with periodic lock/gem pulse
 */
export function paintCardChestFrame(r, tierId, opened, state = 'locked', elapsedMs = 0) {
  const tier = normTier(tierId);
  const C = col => (r.is32 ? col32(col) : col);
  if (r.is32) r.buf.fill(0);
  else r.g.fill(null);

  const pal = CARD_ANIM_PAL[tier];
  const offMs = CARD_TIER_OFFSET[tier] || 0;
  const tMs = Math.max(0, elapsedMs) + offMs;
  const tick = Math.floor(tMs / 55);

  if (state === 'ready' && !opened) {
    const pose = sealedIdlePose(tMs);
    const fIdx = pose.jumpY <= -3 ? 1 : 0;
    drawTierChest(r, tier, fIdx, pose.shakeX, pose.jumpY, 0);

    // Alternating tier sparkles around eager chest
    const spA = tick % 18;
    if (spA < 10) {
      const sy = 16 - Math.floor(spA / 2) + Math.round(pose.jumpY * 0.5);
      if (spA >= 2 && spA <= 7) drawSparkle(r, C(pal.primary), C('#ffffff'), 12 + pose.shakeX, sy, 1);
      else r.put(C(pal.secondary), 12 + pose.shakeX, sy);
    }
    const spB = (tick + 9) % 18;
    if (spB < 10) {
      const sy = 18 - Math.floor(spB / 2) + Math.round(pose.jumpY * 0.5);
      if (spB >= 2 && spB <= 7) drawSparkle(r, C(pal.secondary), C('#ffffff'), 51 + pose.shakeX, sy, 1);
      else r.put(C(pal.primary), 51 + pose.shakeX, sy);
    }
    // Periodic bright clasp gleam
    const glint = tick % 26;
    if (glint <= 3) {
      const gx = 21 + glint + pose.shakeX;
      r.put(C('#ffffff'), gx, 43 + pose.jumpY);
      r.put(C(pal.gem), gx, 44 + pose.jumpY);
    }
    return;
  }

  if (opened) {
    drawTierChest(r, tier, 10, 0, 0, 0);

    // Floating pixel sparks & embers rising cleanly from open treasure chest mouth
    const streams = [
      [25, 29, 0, pal.secondary],
      [32, 27, 7, pal.primary],
      [38, 29, 14, pal.gem],
      [29, 26, 21, pal.secondary],
    ];
    for (const [bx, by, delay, col] of streams) {
      const phase = (tick + delay) % 28;
      if (phase < 19) {
        const y = by - phase;
        const sway = phase % 8 < 4 ? 0 : 1;
        if (phase >= 5 && phase <= 11) {
          drawSparkle(r, C(col), C('#ffffff'), bx + sway, y, 1);
        } else {
          r.put(C(phase > 14 ? col : '#ffffff'), bx + sway, y);
        }
      }
    }

    // Treasure hoard coin shimmer inside the open lid
    const glintIdx = Math.floor(tick / 4) % 4;
    const hoardGlints = [[27, 30], [34, 31], [30, 29], [23, 31]];
    const [hgx, hgy] = hoardGlints[glintIdx];
    r.put(C('#ffffff'), hgx, hgy);
    r.put(C(pal.gem), hgx + 1, hgy);

    // Extra twin orbiting aura sparks when this relic power is actively equipped
    if (state === 'equipped') {
      const bob = Math.round(Math.sin(tMs * 0.0055) * 4);
      drawSparkle(r, C(pal.primary), C('#ffffff'), 10, 31 + bob, 1);
      drawSparkle(r, C(pal.secondary), C('#ffffff'), 53, 31 - bob, 1);
      const crestPhase = tick % 20;
      if (crestPhase < 4) r.put(C('#ffffff'), 29 + crestPhase, 12);
    }
    return;
  }

  // Locked chest: grounded with calm ember mote float, lock-gem pulse & subtle shiver
  const microShake = tick % 56 === 48 ? -1 : tick % 56 === 50 ? 1 : 0;
  drawTierChest(r, tier, 0, microShake, 0, 0);

  // Subtle ambient dust motes hovering near dark horizon around the chest
  const m1y = 20 + Math.round(Math.sin(tMs * 0.0028) * 2);
  const m2y = 24 - Math.round(Math.cos(tMs * 0.0024) * 2);
  r.put(C(pal.primary), 13, m1y);
  r.put(C(pal.secondary), 50, m2y);

  // Periodic lock/emblem crystal glint so even locked chests feel alive
  const gemCycle = tick % 34;
  if (gemCycle < 6) {
    const gemPts = tier === 'gold'
      ? [[22, 43], [25, 43]]
      : tier === 'ruby'
        ? [[20, 41], [27, 41], [23, 43]]
        : [[23, 44], [24, 44]];
    const col = gemCycle < 3 ? '#ffffff' : pal.gem;
    for (const [gx, gy] of gemPts) r.put(C(col), gx + microShake, gy);
  }
}

const cardAnimEntries = new Set();
let cardAnimRafId = 0;

function stopCardLoop() {
  if (cardAnimRafId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(cardAnimRafId);
  }
  cardAnimRafId = 0;
}

function stepCardAnimations(now) {
  cardAnimRafId = 0;
  if (typeof document !== 'undefined' && document.hidden) return;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduced) return;

  let activeCount = 0;
  for (const entry of cardAnimEntries) {
    if (!entry.canvas.isConnected) {
      cardAnimEntries.delete(entry);
      continue;
    }
    if (entry.canvas.closest?.('[hidden]')) continue;
    activeCount += 1;
    const elapsed = Math.max(0, (now || 0) - entry.startMs);
    const step = Math.floor(elapsed / 55);
    if (step === entry.lastStep) continue;
    entry.lastStep = step;
    paintCardChestFrame(entry.surface, entry.tier, entry.opened, entry.state, elapsed);
    entry.ctx.putImageData(entry.img, 0, 0);
  }
  if (activeCount > 0 && typeof requestAnimationFrame === 'function') {
    cardAnimRafId = requestAnimationFrame(stepCardAnimations);
  }
}

/** Start or resume shared 20fps pixel animations across visible Vault chest cards. */
export function wakeCardChestAnimations() {
  if (cardAnimRafId || cardAnimEntries.size === 0 || typeof requestAnimationFrame !== 'function') return;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduced) return;
  cardAnimRafId = requestAnimationFrame(stepCardAnimations);
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wakeCardChestAnimations();
  });
}

const CHEST_LAYER_ROOT = 'icons/chests/layers';

function buildLiveChestRig(tier, opened, chestState) {
  const mk = (tag, cls) => {
    const n = document.createElement(tag);
    n.className = cls;
    return n;
  };
  const img = (file, cls) => {
    const i = mk('img', `ha-live-chest-layer ${cls}`);
    i.setAttribute('src', `${CHEST_LAYER_ROOT}/${file}`);
    i.setAttribute('alt', '');
    return i;
  };

  const wrap = mk('div', 'ha-live-chest');
  wrap.dataset.tier = tier;
  wrap.dataset.state = chestState;
  wrap.setAttribute('aria-hidden', 'true');

  const rays = mk('span', 'ha-live-chest-rays');
  const shadow = mk('span', 'ha-live-chest-shadow');
  const aura = mk('span', 'ha-live-chest-aura');
  const ring = mk('span', 'ha-live-chest-ring');
  const rig = mk('span', 'ha-live-chest-rig');

  if (opened) {
    rig.append(img(`${tier}-open.png`, 'is-open'));
    rig.append(img(`${tier}-hoard-float.png`, 'is-hoard-float'));
    rig.append(img(`${tier}-sparks-a.png`, 'is-sparks-a'));
    rig.append(img(`${tier}-sparks-b.png`, 'is-sparks-b'));
  } else {
    rig.append(img(`${tier}-closed.png`, 'is-closed'));
    if (chestState === 'ready') {
      rig.append(img(`${tier}-peek.png`, 'is-peek'));
      rig.append(img(`${tier}-sparks-a.png`, 'is-sparks-a'));
      rig.append(img(`${tier}-sparks-b.png`, 'is-sparks-b'));
    }
    const mask = mk('span', 'ha-live-chest-sheen-mask');
    mask.setAttribute('style', `--chest-mask-url:url('${CHEST_LAYER_ROOT}/${tier}-sheen-mask.png')`);
    mask.append(mk('span', 'ha-live-chest-sheen'));
    rig.append(mask);
  }

  wrap.append(rays);
  wrap.append(shadow);
  wrap.append(aura);
  wrap.append(ring);
  wrap.append(rig);
  return wrap;
}

/** Build a Vault Card chest stage displaying a 60fps articulated 256x256 HabitArc pixel chest. */
export function chestArt(chest, opened, { state } = {}) {
  const tier = normTier(chest?.id);
  const chestState = state || (opened ? 'collected' : 'locked');
  const stage = document.createElement('div');
  stage.className = 'lb-chest-art';
  stage.dataset.tier = tier;
  stage.dataset.open = String(Boolean(opened));
  stage.dataset.style = 'pixel-game';
  stage.dataset.liveChest = '1';
  stage.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'lb-chest-canvas';
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext?.('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(64, 64);
    const buf32 = new Uint32Array(img.data.buffer);
    const surface = makeSurface32(64, 64, buf32);
    paintCardChestFrame(surface, tier, Boolean(opened), chestState, 0);
    ctx.putImageData(img, 0, 0);
  }

  const liveChest = buildLiveChestRig(tier, Boolean(opened), chestState);
  stage.append(canvas);
  stage.append(liveChest);
  return stage;
}

function buildLiveRevealHero(tier, opened) {
  const mk = (tag, cls) => {
    const n = document.createElement(tag);
    n.className = cls;
    return n;
  };
  const img = (file, cls) => {
    const i = mk('img', `ha-live-chest-layer ${cls}`);
    i.setAttribute('src', `${CHEST_LAYER_ROOT}/${file}`);
    i.setAttribute('alt', '');
    return i;
  };

  const hero = mk('div', 'ha-reveal-hero');
  hero.dataset.tier = tier;
  hero.dataset.phase = opened ? 'revealed' : 'sealed';

  const rays = mk('span', 'ha-reveal-rays');
  const glow = mk('span', 'ha-reveal-glow');
  const ring = mk('span', 'ha-reveal-ring');
  const shadow = mk('span', 'ha-reveal-shadow');

  const chestWrap = mk('span', 'ha-reveal-chest');
  chestWrap.append(img(`${tier}-closed.png`, 'is-closed'));
  chestWrap.append(img(`${tier}-peek.png`, 'is-peek'));
  chestWrap.append(img(`${tier}-open.png`, 'is-open'));
  chestWrap.append(img(`${tier}-hoard-float.png`, 'is-hoard-float'));
  chestWrap.append(img(`${tier}-sparks-a.png`, 'is-sparks-a'));
  chestWrap.append(img(`${tier}-sparks-b.png`, 'is-sparks-b'));
  const mask = mk('span', 'ha-live-chest-sheen-mask');
  mask.setAttribute('style', `--chest-mask-url:url('${CHEST_LAYER_ROOT}/${tier}-sheen-mask.png')`);
  mask.append(mk('span', 'ha-live-chest-sheen'));
  chestWrap.append(mask);

  hero.append(rays);
  hero.append(glow);
  hero.append(ring);
  hero.append(shadow);
  hero.append(chestWrap);
  return hero;
}

/**
 * Create the zero-lag 60fps requestAnimationFrame fullscreen pixel reveal stage.
 * Plays an alive hop-and-wiggle idle loop while sealed, smoothly animates opening buildup
 * and center takeover on tap, and cleans up all loops/listeners on stop().
 */
export function createRevealStage(chest, opened = false) {
  const tier = normTier(chest?.id);
  const stage = document.createElement('div');
  stage.className = 'lb-chest-art lb-reveal-stage';
  stage.dataset.tier = tier;
  stage.dataset.open = String(Boolean(opened));
  stage.dataset.style = 'pixel-reveal';
  stage.dataset.liveReveal = '1';
  stage.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'lb-reveal-canvas';
  stage.append(canvas);

  const revealHero = buildLiveRevealHero(tier, Boolean(opened));
  stage.append(revealHero);

  const ctx = canvas.getContext?.('2d') || null;
  if (ctx) ctx.imageSmoothingEnabled = false;

  let gw = STAGE_WIDTH, gh = STAGE_HEIGHT;
  let img = null, buf32 = null, surface = null, lut = null;
  let lastPaintKey = '';

  const initSurface = () => {
    const win = typeof window !== 'undefined' ? window : null;
    const dims = computeStageDimensions(win?.innerWidth || 0, win?.innerHeight || 0);
    if (gw === dims.width && gh === dims.height && surface) return;
    gw = dims.width;
    gh = dims.height;
    canvas.width = gw;
    canvas.height = gh;
    if (ctx) {
      img = ctx.createImageData(gw, gh);
      buf32 = new Uint32Array(img.data.buffer);
      surface = makeSurface32(gw, gh, buf32);
      lut = getPolarLut(gw, gh, Math.round(gh * 0.43));
    }
    lastPaintKey = '';
  };

  const paintState = (state, paintKey = '') => {
    if (!ctx || !surface) return;
    if (paintKey && paintKey === lastPaintKey) return;
    lastPaintKey = paintKey;
    paintRevealScene(surface, tier, state, lut);
    ctx.putImageData(img, 0, 0);
  };

  initSurface();

  let rafId = 0;
  let fallbackTimer = 0;
  let stopped = false;
  let mode = opened ? 'revealed' : 'idle';
  let startMs = 0;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (fn => setTimeout(() => fn(performance.now()), 16));
  const cancelRaf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;

  const paintIdleAt = (elapsedMs) => {
    const pose = sealedIdlePose(elapsedMs);
    paintState(pose, 'idle:' + pose.jumpY + ':' + pose.shakeX);
  };

  const startLoop = (stepFn) => {
    cancelRaf(rafId);
    clearTimeout(fallbackTimer);
    startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = (now) => {
      if (stopped) return;
      const elapsed = Math.max(0, (now || Date.now()) - startMs);
      stepFn(elapsed);
      if (!stopped) rafId = raf(tick);
    };
    stepFn(0);
    rafId = raf(tick);
  };

  const startIdle = () => {
    if (!ctx || opened || stopped) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced) {
      paintState({ mode: 'idle', jumpY: 0, shakeX: 0 }, 'idle-static');
      return;
    }
    startLoop(paintIdleAt);
  };

  const onResize = () => {
    initSurface();
    if (mode === 'idle') paintState({ mode: 'idle', jumpY: 0, shakeX: 0 });
    else if (mode === 'revealed') paintState({ mode: 'showcase', t: 6 });
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onResize);
  }

  if (opened) paintState({ mode: 'showcase', t: 6 }, 'opened-static');
  else startIdle();

  return {
    stage,
    play({ reducedMotion = false, onClimax } = {}) {
      cancelRaf(rafId);
      clearTimeout(fallbackTimer);
      stopped = false;
      stage.dataset.open = 'true';
      initSurface();
      if (reducedMotion) {
        mode = 'revealed';
        revealHero.dataset.phase = 'revealed';
        paintState({ mode: 'showcase', t: 6 }, 'reduced');
        onClimax?.();
        return;
      }

      mode = 'opening';
      revealHero.dataset.phase = 'opening';
      let notified = false;
      let lastDrawAt = -Infinity;
      const { rattleMs: RATTLE_END, riseStartMs: RISE_START, riseDurMs: RISE_DUR, climaxMs: CLIMAX_MS } = REVEAL_TIMING;

      startLoop((elapsed) => {
        if (elapsed - lastDrawAt < 14) return;
        lastDrawAt = elapsed;

        if (elapsed < RISE_START) {
          if (elapsed < RATTLE_END) {
            const k = Math.floor(elapsed / 60);
            const shakeX = k % 2 === 0 ? -1 : 1;
            const chestIdx = Math.min(3, k + 1);
            paintState({ mode: 'open-lid', chestIdx, shakeX, spark: 0 }, 'lid:' + chestIdx + ':' + shakeX);
          } else {
            const p = (elapsed - RATTLE_END) / (RISE_START - RATTLE_END);
            const step = Math.min(7, Math.floor(p * 8));
            const chestIdx = Math.min(11, 4 + step);
            const spark = step >= 5 ? step - 4 : 0;
            paintState({ mode: 'open-lid', chestIdx, shakeX: 0, spark }, 'lid:' + chestIdx + ':sp' + spark);
          }
          return;
        }

        if (elapsed < CLIMAX_MS) {
          if (revealHero.dataset.phase !== 'burst') revealHero.dataset.phase = 'burst';
          const p = (elapsed - RISE_START) / RISE_DUR;
          paintState({ mode: 'rising', p, climax: p > 0.93 ? 1 : 0 });
          return;
        }

        mode = 'revealed';
        if (revealHero.dataset.phase !== 'revealed') revealHero.dataset.phase = 'revealed';
        const t = ((elapsed - CLIMAX_MS) % 3080) / 95;
        paintState({ mode: 'showcase', t });
        if (!notified && elapsed >= CLIMAX_MS + 70) {
          notified = true;
          onClimax?.();
        }
      });

      // Background-tab safety net if requestAnimationFrame is suspended
      fallbackTimer = setTimeout(() => {
        if (stopped || notified) return;
        notified = true;
        mode = 'revealed';
        paintState({ mode: 'showcase', t: 6 });
        onClimax?.();
      }, CLIMAX_MS + 350);
    },
    stop() {
      stopped = true;
      cancelRaf(rafId);
      clearTimeout(fallbackTimer);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', onResize);
      }
    },
  };
}

export const TREASURE_SOUND_KEY = 'habitarc_treasure_sound';

const REVEAL_TIMING = Object.freeze({
  rattleMs: 180,
  riseStartMs: 540,
  riseDurMs: 820,
  climaxMs: 1360,
});

const CHEST_AUDIO_TRACKS = Object.freeze({
  wood: {
    climb: [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77],
    fanfare: [[0, 783.99, 0.085], [85, 987.77, 0.085], [170, 1174.66, 0.085], [265, 1567.98, 0.34]],
    chord: [392.0, 493.88],
    chordAt: 265,
  },
  iron: {
    climb: [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66],
    fanfare: [[0, 880.0, 0.08], [85, 1046.5, 0.08], [170, 1318.51, 0.08], [255, 1174.66, 0.08], [345, 1760.0, 0.38]],
    chord: [440.0, 659.25],
    chordAt: 345,
  },
  gold: {
    climb: [440.0, 493.88, 554.37, 659.25, 739.99, 880.0, 1108.73, 1318.51],
    fanfare: [[0, 783.99, 0.085], [90, 830.61, 0.085], [180, 880.0, 0.085], [280, 1174.66, 0.44], [510, 1760.0, 0.2]],
    chord: [369.99, 440.0, 587.33],
    chordAt: 280,
  },
  ruby: {
    climb: [440.0, 523.25, 587.33, 659.25, 783.99, 987.77, 1174.66, 1567.98],
    fanfare: [[0, 659.25, 0.08], [80, 783.99, 0.08], [160, 987.77, 0.08], [245, 1174.66, 0.09], [340, 1567.98, 0.46], [560, 1975.53, 0.22]],
    chord: [392.0, 493.88, 587.33],
    chordAt: 340,
  },
});

let treasureAudioCtx = null;
let treasureAudioCtor = null;

/** Check whether chest 8-bit sound effects are enabled (defaults ON unless muted). */
export function getTreasureSoundEnabled() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(TREASURE_SOUND_KEY) === '0' ? false : true;
  } catch {
    return true;
  }
}

/** Persist the user's chest sound effect preference. */
export function setTreasureSoundEnabled(enabled) {
  try {
    if (typeof window !== 'undefined') window.localStorage?.setItem(TREASURE_SOUND_KEY, enabled ? '1' : '0');
  } catch {
    // Optional preference storage.
  }
}

function openAudioMaster() {
  const win = typeof window !== 'undefined' ? window : null;
  const AudioCtor = win && (win.AudioContext || win.webkitAudioContext);
  if (!AudioCtor) return null;
  try {
    if (!treasureAudioCtx || treasureAudioCtx.state === 'closed' || treasureAudioCtor !== AudioCtor) {
      treasureAudioCtor = AudioCtor;
      treasureAudioCtx = new AudioCtor();
    }
    if (treasureAudioCtx.state === 'suspended') {
      void treasureAudioCtx.resume?.().catch(() => {});
    }
    const master = treasureAudioCtx.createGain();
    master.gain.value = 0.44;
    master.connect(treasureAudioCtx.destination);
    return { ctx: treasureAudioCtx, master };
  } catch {
    return null;
  }
}

function scheduleChipTone(ctx, master, baseSec, atMs, freq, durSec, type = 'square', peakGain = 0.08, endFreq = null) {
  const at = baseSec + atMs / 1000;
  const d = Math.max(0.025, durSec);
  const f0 = Math.max(40, freq);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  if (endFreq && endFreq !== f0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), at + d);
  }
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peakGain), at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + d);
  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + d + 0.02);
}

/**
 * Play synchronized 8-bit chiptune chest SFX across lock rattle, lid pop, item rise, and relic fanfare.
 * Returns a stop() handle that cleanly silences audio if the modal closes early.
 */
export function playChestRevealAudio(tierId, { reducedMotion = false } = {}) {
  if (!getTreasureSoundEnabled()) return () => {};
  const audio = openAudioMaster();
  if (!audio) return () => {};

  const { ctx, master } = audio;
  const tier = normTier(tierId);
  const track = CHEST_AUDIO_TRACKS[tier];
  const baseSec = (Number(ctx.currentTime) || 0) + 0.015;
  const play = (atMs, f, dur, type, g, to) => scheduleChipTone(ctx, master, baseSec, atMs, f, dur, type, g, to);

  if (!reducedMotion) {
    // 1. Tap rattle & lock unclasp (0..180ms)
    play(0, 240, 0.045, 'square', 0.075, 145);
    play(60, 290, 0.045, 'square', 0.075, 175);
    play(120, 360, 0.055, 'square', 0.085, 560);

    // 2. Chest lid swing & spark glint (180..540ms)
    play(REVEAL_TIMING.rattleMs + 5, 150, 0.17, 'triangle', 0.12, 310);
    play(REVEAL_TIMING.rattleMs + 95, 490, 0.065, 'square', 0.05, 740);
    play(REVEAL_TIMING.rattleMs + 240, 987.77, 0.075, 'square', 0.048, 1318.51);

    // 3. Rising magic item buildup arpeggio (540..1360ms)
    const span = REVEAL_TIMING.riseDurMs - 65;
    const stepMs = span / track.climb.length;
    track.climb.forEach((f, idx) => {
      const tMs = REVEAL_TIMING.riseStartMs + Math.round(idx * stepMs);
      play(tMs, f, 0.095, 'square', 0.046);
      if (idx % 2 === 0) play(tMs, f * 0.5, 0.12, 'triangle', 0.045);
    });
  }

  // 4. Climax flash punch & tier-specific 8-bit loot fanfare
  const climaxAt = reducedMotion ? 0 : REVEAL_TIMING.climaxMs;
  play(climaxAt, 150, 0.19, 'sine', 0.17, 55);
  for (const [offsetMs, freq, dur] of track.fanfare) {
    play(climaxAt + offsetMs, freq, dur, 'square', 0.075);
  }
  for (const rootFreq of track.chord) {
    play(climaxAt + track.chordAt, rootFreq, 0.36, 'triangle', 0.065);
  }

  return () => {
    try {
      master.disconnect();
    } catch {
      // Already disconnected.
    }
  };
}

/** Play a brief 8-bit equip sparkle chime when equipping a relic power. */
export function playChestEquipChime() {
  if (!getTreasureSoundEnabled()) return;
  const audio = openAudioMaster();
  if (!audio) return;
  const { ctx, master } = audio;
  const baseSec = (Number(ctx.currentTime) || 0) + 0.01;
  scheduleChipTone(ctx, master, baseSec, 0, 587.33, 0.06, 'square', 0.065);
  scheduleChipTone(ctx, master, baseSec, 55, 880.0, 0.06, 'square', 0.065);
  scheduleChipTone(ctx, master, baseSec, 110, 1174.66, 0.16, 'square', 0.07);
}
