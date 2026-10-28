Pod::Spec.new do |s|
  s.name           = 'UnscrollBlocker'
  s.version        = '1.0.0'
  s.summary        = 'Unscroll iOS enforcement (Screen Time shield)'
  s.description    = 'Keeps the official Instagram app shielded with ManagedSettings.'
  s.license        = 'UNLICENSED'
  s.author         = 'Unscroll'
  s.homepage       = 'https://example.invalid/unscroll'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'FamilyControls', 'ManagedSettings', 'SwiftUI'
  s.source_files   = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
